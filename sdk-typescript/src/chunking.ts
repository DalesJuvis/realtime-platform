/**
 * `chunking.ts` — Messages plus grands que les 211 octets d'un seul
 * frame, sans toucher au format de frame lui-même (toujours exactement
 * 256 octets, `protocol.ts` inchangé). Un message qui tient dans un seul
 * frame est envoyé exactement comme avant — zéro overhead, zéro
 * changement de comportement pour le cas courant.
 *
 * Un message trop grand est découpé en plusieurs frames PUB/UNICAST
 * ordinaires, chacun portant un petit en-tête texte dans son payload :
 *
 * ```text
 * "\x01" + msgId(4) + ":" + index + ":" + total + ":" + data...
 * ```
 *
 * `"\x01"` (SOH) marque un frame de chunk — un payload applicatif normal
 * ne commence quasiment jamais par ce caractère de contrôle. Le serveur
 * ne voit ici que des frames PUB/UNICAST ordinaires : aucun changement
 * côté serveur n'est nécessaire, le découpage/réassemblage est entièrement
 * porté par ce SDK. Un pair qui ne comprend pas ce format (autre SDK,
 * version antérieure) verra simplement plusieurs messages fragmentaires —
 * limitation connue, documentée dans le README.
 *
 * **Rattrapage (`replay()`) :** chaque chunk est stocké séparément dans
 * l'historique serveur (ring buffer de capacité fixe) ; un message
 * chunké dont certains chunks ont été évincés avant les autres ne sera
 * jamais réassemblé au replay — même compromis que pour un message normal
 * trop ancien, juste par chunk plutôt que par message entier.
 */

import { LEN_PAYLOAD, ProtocolError } from "./protocol.js";

/** SOH (Start of Heading, code point 1), via un échappement explicite
 * plutôt qu'un caractère de contrôle brut dans le fichier source — plus
 * sûr à éditer/versionner, aucun risque qu'un outil le corrompe silencieusement. */
const CHUNK_MARKER = "\x01";
const MSG_ID_LEN = 4;
const MSG_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Réservation pessimiste (jusqu'à 4 chiffres pour `index`/`total`, soit
 * 9999 chunks) — évite le problème d'œuf-et-poule où la largeur de
 * l'en-tête dépend du nombre de chunks, qui dépend de la largeur de l'en-tête. */
const HEADER_MAX_OVERHEAD = 1 /* marker */ + MSG_ID_LEN + 1 + 4 + 1 + 4 + 1;
const DATA_BUDGET_PER_CHUNK = LEN_PAYLOAD - HEADER_MAX_OVERHEAD;

const MAX_CHUNKS = 9999;
/** Garde-fou par défaut, pas une limite protocolaire — évite qu'un appel
 * malencontreux avec un payload de plusieurs Mo ne génère des milliers de
 * frames. Ajustable via `RealtimeClientConfig.maxMessageBytes`. */
export const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;

const textEncoder = new TextEncoder();

function utf8ByteLength(s: string): number {
  return textEncoder.encode(s).length;
}

function randomMsgId(): string {
  let id = "";
  for (let i = 0; i < MSG_ID_LEN; i++) {
    id += MSG_ID_CHARS[Math.floor(Math.random() * MSG_ID_CHARS.length)];
  }
  return id;
}

/** Découpe `text` en morceaux dont l'encodage UTF-8 tient dans
 * `maxBytesPerPiece` octets, sans jamais couper un point de code au milieu. */
function splitByByteBudget(text: string, maxBytesPerPiece: number): string[] {
  const pieces: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let lo = 1;
    let hi = remaining.length;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (utf8ByteLength(remaining.slice(0, mid)) <= maxBytesPerPiece) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    // `best === 0` seulement si un unique caractère (ex: emoji 4 octets)
    // dépasse déjà le budget — on l'inclut quand même pour garantir une
    // progression ; en pratique le budget (194 octets) rend ce cas quasi impossible.
    const take = best === 0 ? 1 : best;
    pieces.push(remaining.slice(0, take));
    remaining = remaining.slice(take);
  }
  return pieces;
}

/**
 * Encode `payload` en un ou plusieurs payloads prêts à être envoyés
 * chacun dans un frame séparé (même opcode, même canal, dans l'ordre).
 * Retourne `[payload]` tel quel si `payload` tient déjà dans un seul
 * frame — c'est le chemin normal, inchangé.
 */
export function encodeChunks(payload: string, maxMessageBytes: number = DEFAULT_MAX_MESSAGE_BYTES): string[] {
  const totalBytes = utf8ByteLength(payload);
  if (totalBytes <= LEN_PAYLOAD) return [payload];

  if (totalBytes > maxMessageBytes) {
    throw new ProtocolError(
      `message trop volumineux : ${totalBytes} octets dépasse la limite de ${maxMessageBytes} octets ` +
        `(ajustable via RealtimeClientConfig.maxMessageBytes)`,
    );
  }

  const pieces = splitByByteBudget(payload, DATA_BUDGET_PER_CHUNK);
  if (pieces.length > MAX_CHUNKS) {
    throw new ProtocolError(`message nécessite ${pieces.length} chunks, au-delà de la limite de ${MAX_CHUNKS}`);
  }

  const msgId = randomMsgId();
  const total = pieces.length;
  return pieces.map((piece, index) => `${CHUNK_MARKER}${msgId}:${index}:${total}:${piece}`);
}

export interface ChunkHeader {
  msgId: string;
  index: number;
  total: number;
  data: string;
}

/** Reconnaît et décompose l'en-tête d'un frame de chunk — `null` si
 * `payload` est un message ordinaire (l'écrasante majorité des cas). */
export function parseChunk(payload: string): ChunkHeader | null {
  if (payload.length < MSG_ID_LEN + 5 || payload[0] !== CHUNK_MARKER) return null;

  const msgId = payload.slice(1, 1 + MSG_ID_LEN);
  const rest = payload.slice(1 + MSG_ID_LEN);
  if (rest[0] !== ":") return null;

  const secondColon = rest.indexOf(":", 1);
  if (secondColon === -1) return null;
  const indexStr = rest.slice(1, secondColon);

  const afterIndex = rest.slice(secondColon + 1);
  const thirdColon = afterIndex.indexOf(":");
  if (thirdColon === -1) return null;
  const totalStr = afterIndex.slice(0, thirdColon);
  const data = afterIndex.slice(thirdColon + 1);

  const index = Number(indexStr);
  const total = Number(totalStr);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total <= 0 || index >= total) {
    return null;
  }

  return { msgId, index, total, data };
}

interface PendingReassembly {
  total: number;
  parts: Map<number, string>;
  firstSeenAt: number;
}

const REASSEMBLY_TTL_MS = 30_000;

/**
 * État de réassemblage, un par `RealtimeClient`. Nettoyage paresseux
 * (`sweepStale`, appelé à chaque `feed`) plutôt qu'un timer dédié — un
 * client qui ne reçoit plus de chunk n'a pas besoin de tourner à vide.
 */
export class ChunkReassembler {
  private readonly pending = new Map<string, PendingReassembly>();

  /** Intègre un chunk ; retourne le texte complet une fois tous les
   * chunks reçus, sinon `null` (réassemblage encore en cours). */
  feed(header: ChunkHeader): string | null {
    this.sweepStale();

    let entry = this.pending.get(header.msgId);
    if (!entry) {
      entry = { total: header.total, parts: new Map(), firstSeenAt: Date.now() };
      this.pending.set(header.msgId, entry);
    }
    entry.parts.set(header.index, header.data);

    if (entry.parts.size < entry.total) return null;

    this.pending.delete(header.msgId);
    let out = "";
    for (let i = 0; i < entry.total; i++) {
      out += entry.parts.get(i) ?? "";
    }
    return out;
  }

  private sweepStale(): void {
    const now = Date.now();
    for (const [id, entry] of this.pending) {
      if (now - entry.firstSeenAt > REASSEMBLY_TTL_MS) this.pending.delete(id);
    }
  }
}
