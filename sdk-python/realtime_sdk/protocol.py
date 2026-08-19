"""``protocol.py`` — Encodeur/décodeur du frame binaire fixe de 256 octets.

Doit rester **identique bit à bit** à ``protocol.rs`` côté serveur : mêmes
offsets, même CRC16, même ordre d'octets (big-endian). Toute dérive entre
les implémentations casse silencieusement la compatibilité.

Aucune dépendance externe — uniquement la bibliothèque standard (``uuid``,
``struct``, ``dataclasses``) — pour que ce module reste testable et
utilisable indépendamment du reste du SDK (ex: dans un script de debug
qui inspecte des frames capturées, sans avoir besoin de ``websockets``).
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from enum import IntEnum
from uuid import UUID

FRAME_SIZE = 256
MAGIC = 0xAA01

_OFF_MAGIC = 0
_OFF_OPCODE = 2
_OFF_TENANT = 3
_LEN_TENANT = 16
_OFF_CHANNEL = _OFF_TENANT + _LEN_TENANT  # 19
_LEN_CHANNEL = 24
_OFF_PAYLOAD = _OFF_CHANNEL + _LEN_CHANNEL  # 43
_LEN_PAYLOAD = 211
_OFF_CRC = _OFF_PAYLOAD + _LEN_PAYLOAD  # 254
_LEN_CRC = 2

assert _OFF_CRC + _LEN_CRC == FRAME_SIZE, "layout de frame incohérent avec FRAME_SIZE"


class Opcode(IntEnum):
    SUBSCRIBE = 0x01
    PUBLISH = 0x02
    MESSAGE = 0x03
    AUTH = 0x04
    PING = 0x05
    PRESENCE = 0x06
    #: Rattrapage : payload = timestamp Unix (secondes, ASCII décimal).
    REPLAY = 0x07
    #: Envoi direct : ``channel_id`` est repurposé pour porter l'ID du
    #: destinataire, résolu côté serveur vers sa boîte privée ``user:{id}``.
    UNICAST = 0x08
    #: Désabonnement explicite d'un canal ou motif déjà souscrit.
    UNSUB = 0x09


class ProtocolError(Exception):
    """Erreur de décodage d'un frame — message toujours explicite sur la
    cause exacte (longueur, magic, opcode, CRC, UTF-8), sans exposer les
    octets bruts dans le message pour rester sûr à logger tel quel."""


@dataclass(frozen=True)
class DecodedFrame:
    opcode: Opcode
    tenant_id: UUID
    channel_id: str
    payload: str


def _write_padded(width: int, s: str) -> bytes:
    """Encode ``s`` en UTF-8, tronqué pour tenir dans ``width`` octets sans
    jamais couper un caractère multi-octets au milieu, puis paddé à zéro.

    ``errors="ignore"`` sur le second passage de décodage supprime
    silencieusement la séquence UTF-8 finale coupée en deux par la
    troncature brute — comportement équivalent au retour en arrière sur
    frontière de caractère (``is_char_boundary``) côté Rust.
    """
    encoded = s.encode("utf-8")
    if len(encoded) > width:
        encoded = encoded[:width].decode("utf-8", errors="ignore").encode("utf-8")
    return encoded + b"\x00" * (width - len(encoded))


def _read_trimmed(data: bytes) -> str:
    end = data.find(b"\x00")
    if end == -1:
        end = len(data)
    return data[:end].decode("utf-8")


def crc16_ccitt_false(data: bytes) -> int:
    """CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF, pas de reflet, pas de
    xorout) — identique à ``crc16_ccitt_false`` dans ``protocol.rs``."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc & 0xFFFF


def encode_frame(opcode: Opcode, tenant_id: UUID, channel_id: str = "", payload: str = "") -> bytes:
    """Encode un frame sortant, checksummé et paddé à 256 octets."""
    buf = bytearray(FRAME_SIZE)

    struct.pack_into(">H", buf, _OFF_MAGIC, MAGIC)
    buf[_OFF_OPCODE] = int(opcode)
    # UUID.bytes est déjà le layout big-endian standard RFC 4122, identique
    # à `Uuid::as_bytes()` côté Rust — pas de conversion supplémentaire.
    buf[_OFF_TENANT : _OFF_TENANT + _LEN_TENANT] = tenant_id.bytes

    buf[_OFF_CHANNEL : _OFF_CHANNEL + _LEN_CHANNEL] = _write_padded(_LEN_CHANNEL, channel_id)
    buf[_OFF_PAYLOAD : _OFF_PAYLOAD + _LEN_PAYLOAD] = _write_padded(_LEN_PAYLOAD, payload)

    crc = crc16_ccitt_false(bytes(buf[:_OFF_CRC]))
    struct.pack_into(">H", buf, _OFF_CRC, crc)

    return bytes(buf)


def decode_frame(data: bytes) -> DecodedFrame:
    """Décode et valide intégralement un buffer de 256 octets. Ordre de
    validation identique au serveur : longueur → magic → opcode → CRC16 → UTF-8."""
    if len(data) != FRAME_SIZE:
        raise ProtocolError(f"longueur de frame invalide : {FRAME_SIZE} attendus, {len(data)} reçus")

    (magic,) = struct.unpack_from(">H", data, _OFF_MAGIC)
    if magic != MAGIC:
        raise ProtocolError(f"magic/version invalide : 0x{magic:04X}")

    opcode_byte = data[_OFF_OPCODE]
    try:
        opcode = Opcode(opcode_byte)
    except ValueError:
        raise ProtocolError(f"opcode inconnu : 0x{opcode_byte:02X}") from None

    (expected_crc,) = struct.unpack_from(">H", data, _OFF_CRC)
    actual_crc = crc16_ccitt_false(data[:_OFF_CRC])
    if expected_crc != actual_crc:
        raise ProtocolError(
            f"CRC16 invalide : frame annonce 0x{expected_crc:04X}, calculé 0x{actual_crc:04X}"
        )

    try:
        tenant_id = UUID(bytes=data[_OFF_TENANT : _OFF_TENANT + _LEN_TENANT])
        channel_id = _read_trimmed(data[_OFF_CHANNEL : _OFF_CHANNEL + _LEN_CHANNEL])
        payload = _read_trimmed(data[_OFF_PAYLOAD : _OFF_PAYLOAD + _LEN_PAYLOAD])
    except UnicodeDecodeError as err:
        raise ProtocolError("section channel/payload non UTF-8") from err

    return DecodedFrame(opcode=opcode, tenant_id=tenant_id, channel_id=channel_id, payload=payload)


def glob_match(pattern: str, candidate: str) -> bool:
    """Correspondance de glob simple (``*`` = n'importe quelle sous-chaîne),
    portée depuis ``glob_match`` dans ``state.rs``. Le serveur ne renvoie
    que le canal concret réel dans chaque frame, jamais le motif
    d'origine — c'est au client de refaire la correspondance pour router
    vers les bons abonnés locaux (cf. ``client.py``)."""

    def helper(p: str, c: str) -> bool:
        if not p:
            return not c
        if p[0] == "*":
            return any(helper(p[1:], c[i:]) for i in range(len(c) + 1))
        return bool(c) and c[0] == p[0] and helper(p[1:], c[1:])

    return helper(pattern, candidate)
