/**
 * `protocol.ts` — Encodeur/décodeur du frame binaire fixe de 256 octets.
 *
 * Doit rester **bit à bit identique** à `src/protocol.rs` côté serveur :
 * mêmes offsets, même CRC16, même ordre d'octets (big-endian). Toute
 * dérive entre les deux implémentations casse silencieusement la
 * compatibilité — en cas de modification du format côté serveur, ce
 * fichier doit être mis à jour en miroir.
 *
 * Layout (256 octets) :
 * ```text
 * Offset    Taille   Champ
 * ------    ------   -----------------------------------------
 * 0..2      2        Magic + Version   (0xAA01)
 * 2..3      1        Opcode
 * 3..19     16       Tenant ID (UUID brut, 16 octets)
 * 19..43    24       Channel ID (UTF-8, paddé à zéro)
 * 43..254   211      Payload (UTF-8, paddé à zéro)
 * 254..256  2        CRC16/CCITT-FALSE sur les octets [0..254)
 * ```
 */

export const FRAME_SIZE = 256;
export const MAGIC = 0xaa01;

const OFF_MAGIC = 0;
const OFF_OPCODE = 2;
const OFF_TENANT = 3;
const LEN_TENANT = 16;
const OFF_CHANNEL = OFF_TENANT + LEN_TENANT; // 19
const LEN_CHANNEL = 24;
const OFF_PAYLOAD = OFF_CHANNEL + LEN_CHANNEL; // 43
const LEN_PAYLOAD = 211;
const OFF_CRC = OFF_PAYLOAD + LEN_PAYLOAD; // 254
const LEN_CRC = 2;

if (OFF_CRC + LEN_CRC !== FRAME_SIZE) {
  // Garde-fou à la ligne, faute de `const _: () = assert!(...)` façon Rust.
  throw new Error("protocol.ts: layout de frame incohérent avec FRAME_SIZE");
}

export enum Opcode {
  Subscribe = 0x01,
  Publish = 0x02,
  Message = 0x03,
  Auth = 0x04,
  Ping = 0x05,
  Presence = 0x06,
  /** Rattrapage : payload = timestamp Unix (secondes, ASCII décimal). */
  Replay = 0x07,
  /**
   * Envoi direct à un utilisateur. `channelId` est repurposé : il porte
   * l'ID du destinataire (le `sub` du jeton AUTH), pas un nom de canal.
   */
  Unicast = 0x08,
  /** Désabonnement explicite d'un canal ou motif déjà souscrit. */
  Unsub = 0x09,
}

const VALID_OPCODES = new Set<number>(
  Object.values(Opcode).filter((v): v is number => typeof v === "number"),
);

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

/** Un frame décodé, prêt à être consommé par le client. */
export interface DecodedFrame {
  opcode: Opcode;
  tenantId: string;
  channelId: string;
  payload: string;
  /** Buffer brut des 256 octets, pour un usage avancé (relais tel quel). */
  raw: Uint8Array;
}

export interface FrameFields {
  opcode: Opcode;
  tenantId: string;
  channelId?: string;
  payload?: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Convertit un UUID en 16 octets bruts (même layout que `Uuid::as_bytes` côté Rust). */
export function uuidToBytes(uuid: string): Uint8Array {
  if (!UUID_RE.test(uuid)) {
    throw new ProtocolError(`UUID invalide : "${uuid}"`);
  }
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Reconstruit la représentation textuelle standard d'un UUID à partir de 16 octets. */
export function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Écrit `s` dans `dst`, tronqué pour tenir dans `dst.length` octets sans
 * jamais couper un caractère UTF-8 multi-octets au milieu.
 * `TextEncoder.encodeInto` est conçu exactement pour ça : il n'écrit que
 * des points de code complets — comportement analogue à la troncature
 * sur frontière de caractère de `FrameBuilder::write_padded` côté Rust.
 */
function writePadded(dst: Uint8Array, s: string): void {
  dst.fill(0);
  textEncoder.encodeInto(s, dst);
}

/** Lit une section de `dst`, tronquée au premier octet NUL de padding. */
function readTrimmed(src: Uint8Array): string {
  let end = src.indexOf(0);
  if (end === -1) end = src.length;
  return textDecoder.decode(src.subarray(0, end));
}

/**
 * CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF, pas de reflet, pas de
 * xorout) — identique à `crc16_ccitt_false` dans `protocol.rs`.
 */
export function crc16CcittFalse(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] as number) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/** Encode un frame sortant, checksummé et paddé à 256 octets. */
export function encodeFrame(fields: FrameFields): Uint8Array {
  const buf = new Uint8Array(FRAME_SIZE);
  const view = new DataView(buf.buffer);

  view.setUint16(OFF_MAGIC, MAGIC, false); // false = big-endian, comme le serveur
  buf[OFF_OPCODE] = fields.opcode;
  buf.set(uuidToBytes(fields.tenantId), OFF_TENANT);

  writePadded(buf.subarray(OFF_CHANNEL, OFF_CHANNEL + LEN_CHANNEL), fields.channelId ?? "");
  writePadded(buf.subarray(OFF_PAYLOAD, OFF_PAYLOAD + LEN_PAYLOAD), fields.payload ?? "");

  const crc = crc16CcittFalse(buf.subarray(0, OFF_CRC));
  view.setUint16(OFF_CRC, crc, false);

  return buf;
}

/**
 * Décode et valide intégralement un buffer de 256 octets. Ordre de
 * validation identique au serveur : longueur → magic → opcode → CRC16.
 */
export function decodeFrame(buf: Uint8Array): DecodedFrame {
  if (buf.length !== FRAME_SIZE) {
    throw new ProtocolError(`longueur de frame invalide : ${FRAME_SIZE} attendus, ${buf.length} reçus`);
  }

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const magic = view.getUint16(OFF_MAGIC, false);
  if (magic !== MAGIC) {
    throw new ProtocolError(`magic/version invalide : 0x${magic.toString(16).padStart(4, "0")}`);
  }

  const opcodeByte = buf[OFF_OPCODE] as number;
  if (!VALID_OPCODES.has(opcodeByte)) {
    throw new ProtocolError(`opcode inconnu : 0x${opcodeByte.toString(16).padStart(2, "0")}`);
  }

  const expectedCrc = view.getUint16(OFF_CRC, false);
  const actualCrc = crc16CcittFalse(buf.subarray(0, OFF_CRC));
  if (expectedCrc !== actualCrc) {
    throw new ProtocolError(
      `CRC16 invalide : frame annonce 0x${expectedCrc.toString(16)}, calculé 0x${actualCrc.toString(16)}`,
    );
  }

  return {
    opcode: opcodeByte as Opcode,
    tenantId: bytesToUuid(buf.subarray(OFF_TENANT, OFF_TENANT + LEN_TENANT)),
    channelId: readTrimmed(buf.subarray(OFF_CHANNEL, OFF_CHANNEL + LEN_CHANNEL)),
    payload: readTrimmed(buf.subarray(OFF_PAYLOAD, OFF_PAYLOAD + LEN_PAYLOAD)),
    raw: buf,
  };
}

/**
 * Correspondance de glob simple (`*` = n'importe quelle sous-chaîne),
 * portée depuis `glob_match` dans `state.rs`. Utilisée côté client pour
 * router un message reçu vers les handlers de souscriptions par motif :
 * le serveur ne renvoie que le canal concret réel dans chaque frame, pas
 * le motif d'origine — c'est au client de refaire la correspondance.
 */
export function globMatch(pattern: string, candidate: string): boolean {
  function helper(p: string, c: string): boolean {
    if (p.length === 0) return c.length === 0;
    if (p[0] === "*") {
      for (let i = 0; i <= c.length; i++) {
        if (helper(p.slice(1), c.slice(i))) return true;
      }
      return false;
    }
    return c.length > 0 && c[0] === p[0] && helper(p.slice(1), c.slice(1));
  }
  return helper(pattern, candidate);
}
