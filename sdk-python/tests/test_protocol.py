"""``test_protocol.py`` — Tests du codec binaire, via ``unittest`` de la
bibliothèque standard (aucune dépendance de test supplémentaire pour un
SDK destiné à être installé par des tiers)."""

import unittest
from uuid import UUID

from realtime_sdk.protocol import (
    FRAME_SIZE,
    DecodedFrame,
    Opcode,
    ProtocolError,
    crc16_ccitt_false,
    decode_frame,
    encode_frame,
    glob_match,
)

SAMPLE_TENANT = UUID("12345678-9abc-def0-1122-334455667788")


class TestProtocolCodec(unittest.TestCase):
    def test_encode_then_decode_roundtrip(self) -> None:
        raw = encode_frame(Opcode.PUBLISH, SAMPLE_TENANT, "room-42", "hello world")
        self.assertEqual(len(raw), FRAME_SIZE)

        frame = decode_frame(raw)
        self.assertEqual(frame.opcode, Opcode.PUBLISH)
        self.assertEqual(frame.tenant_id, SAMPLE_TENANT)
        self.assertEqual(frame.channel_id, "room-42")
        self.assertEqual(frame.payload, "hello world")

    def test_unicast_opcode_roundtrip(self) -> None:
        raw = encode_frame(Opcode.UNICAST, SAMPLE_TENANT, "user-42", "hey there")
        frame = decode_frame(raw)
        self.assertEqual(frame.opcode, Opcode.UNICAST)
        self.assertEqual(frame.channel_id, "user-42")

    def test_unsub_opcode_roundtrip(self) -> None:
        raw = encode_frame(Opcode.UNSUB, SAMPLE_TENANT, "room-42")
        frame = decode_frame(raw)
        self.assertEqual(frame.opcode, Opcode.UNSUB)
        self.assertEqual(frame.channel_id, "room-42")

    def test_rejects_wrong_length(self) -> None:
        with self.assertRaises(ProtocolError):
            decode_frame(bytes(100))

    def test_rejects_bad_magic(self) -> None:
        raw = bytearray(encode_frame(Opcode.PING, SAMPLE_TENANT))
        raw[0] = 0x00  # corrompt le magic
        with self.assertRaises(ProtocolError):
            decode_frame(bytes(raw))

    def test_rejects_unknown_opcode(self) -> None:
        raw = bytearray(encode_frame(Opcode.PING, SAMPLE_TENANT))
        raw[2] = 0xFF  # opcode invalide
        # Recalcule le CRC pour isoler la vérification de l'opcode.
        from realtime_sdk.protocol import _OFF_CRC  # noqa: PLC0415 (accès interne volontaire pour le test)

        crc = crc16_ccitt_false(bytes(raw[:_OFF_CRC]))
        raw[_OFF_CRC] = (crc >> 8) & 0xFF
        raw[_OFF_CRC + 1] = crc & 0xFF
        with self.assertRaises(ProtocolError):
            decode_frame(bytes(raw))

    def test_rejects_corrupted_checksum(self) -> None:
        raw = bytearray(encode_frame(Opcode.MESSAGE, SAMPLE_TENANT, payload="data"))
        raw[50] ^= 0xFF  # altère un octet du payload sans mettre à jour le CRC
        with self.assertRaises(ProtocolError):
            decode_frame(bytes(raw))

    def test_truncates_oversized_channel_id_at_utf8_boundary(self) -> None:
        raw = encode_frame(Opcode.SUBSCRIBE, SAMPLE_TENANT, channel_id="x" * 100)
        frame = decode_frame(raw)
        self.assertEqual(len(frame.channel_id), 24)

    def test_truncation_never_produces_invalid_utf8(self) -> None:
        # Émoji multi-octets (4 octets en UTF-8) répété pour forcer une
        # coupure exactement au milieu d'un caractère si la troncature
        # était naïve (coupure sur la largeur du champ sans égard aux
        # frontières UTF-8).
        raw = encode_frame(Opcode.PUBLISH, SAMPLE_TENANT, payload="🎉" * 60)
        frame = decode_frame(raw)  # ne doit lever aucune exception
        self.assertTrue(all(ch == "🎉" for ch in frame.payload))

    def test_crc16_deterministic_and_sensitive_to_change(self) -> None:
        a = b"hello"
        b = b"hellp"
        self.assertEqual(crc16_ccitt_false(a), crc16_ccitt_false(a))
        self.assertNotEqual(crc16_ccitt_false(a), crc16_ccitt_false(b))

    def test_glob_match_trailing_wildcard(self) -> None:
        self.assertTrue(glob_match("orders:*", "orders:42"))
        self.assertFalse(glob_match("orders:*", "invoices:42"))

    def test_glob_match_wildcard_in_middle(self) -> None:
        self.assertTrue(glob_match("app_123:*:eu", "app_123:orders:eu"))
        self.assertFalse(glob_match("app_123:*:eu", "app_123:orders:us"))

    def test_decoded_frame_is_a_frozen_dataclass(self) -> None:
        frame = decode_frame(encode_frame(Opcode.PING, SAMPLE_TENANT))
        with self.assertRaises(Exception):
            frame.channel_id = "mutated"  # type: ignore[misc]


if __name__ == "__main__":
    unittest.main()
