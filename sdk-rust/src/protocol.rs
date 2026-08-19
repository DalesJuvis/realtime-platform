//! `protocol.rs` — Encodeur/décodeur du frame binaire fixe de 256 octets.
//!
//! Doit rester **identique bit à bit** à `protocol.rs` côté serveur :
//! mêmes offsets, même CRC16, même ordre d'octets. Toute dérive entre les
//! deux casse silencieusement la compatibilité.
//!
//! Différence assumée avec la version serveur : celle-ci retourne des
//! structures **possédées** (`String`, pas de lifetime empruntée sur le
//! buffer d'origine). Le serveur optimise en zero-copy parce qu'il traite
//! un volume de frames bien plus élevé et par tenant ; un client SDK n'a
//! pas cette contrainte de débit, et des types possédés simplifient
//! nettement l'API publique (pas de lifetime à faire fuiter jusqu'à
//! l'appelant).

use std::fmt;

use uuid::Uuid;

pub const FRAME_SIZE: usize = 256;
pub const MAGIC: u16 = 0xAA01;

const OFF_MAGIC: usize = 0;
const OFF_OPCODE: usize = 2;
const OFF_TENANT: usize = 3;
const LEN_TENANT: usize = 16;
const OFF_CHANNEL: usize = OFF_TENANT + LEN_TENANT; // 19
const LEN_CHANNEL: usize = 24;
const OFF_PAYLOAD: usize = OFF_CHANNEL + LEN_CHANNEL; // 43
const LEN_PAYLOAD: usize = 211;
const OFF_CRC: usize = OFF_PAYLOAD + LEN_PAYLOAD; // 254
const LEN_CRC: usize = 2;

const _: () = assert!(OFF_CRC + LEN_CRC == FRAME_SIZE);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Opcode {
    Subscribe = 0x01,
    Publish = 0x02,
    Message = 0x03,
    Auth = 0x04,
    Ping = 0x05,
    Presence = 0x06,
    /// Rattrapage : payload = timestamp Unix (secondes, ASCII décimal).
    Replay = 0x07,
    /// Envoi direct : `channel_id` est repurposé pour porter l'ID du
    /// destinataire, résolu côté serveur vers sa boîte privée `user:{id}`.
    Unicast = 0x08,
    /// Désabonnement explicite d'un canal ou motif déjà souscrit.
    Unsub = 0x09,
}

impl TryFrom<u8> for Opcode {
    type Error = ProtocolError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(Opcode::Subscribe),
            0x02 => Ok(Opcode::Publish),
            0x03 => Ok(Opcode::Message),
            0x04 => Ok(Opcode::Auth),
            0x05 => Ok(Opcode::Ping),
            0x06 => Ok(Opcode::Presence),
            0x07 => Ok(Opcode::Replay),
            0x08 => Ok(Opcode::Unicast),
            0x09 => Ok(Opcode::Unsub),
            other => Err(ProtocolError::UnknownOpcode(other)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProtocolError {
    InvalidLength(usize),
    BadMagic(u16),
    UnknownOpcode(u8),
    ChecksumMismatch { expected: u16, actual: u16 },
    InvalidUtf8,
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProtocolError::InvalidLength(n) => {
                write!(f, "longueur de frame invalide : {FRAME_SIZE} attendus, {n} reçus")
            }
            ProtocolError::BadMagic(m) => write!(f, "magic/version invalide : 0x{m:04X}"),
            ProtocolError::UnknownOpcode(o) => write!(f, "opcode inconnu : 0x{o:02X}"),
            ProtocolError::ChecksumMismatch { expected, actual } => write!(
                f,
                "CRC16 invalide : frame annonce 0x{expected:04X}, calculé 0x{actual:04X}"
            ),
            ProtocolError::InvalidUtf8 => write!(f, "section channel/payload non UTF-8"),
        }
    }
}

impl std::error::Error for ProtocolError {}

/// Un frame décodé, entièrement possédé (voir note de tête de fichier).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedFrame {
    pub opcode: Opcode,
    pub tenant_id: Uuid,
    pub channel_id: String,
    pub payload: String,
}

/// Champs nécessaires à l'encodage d'un frame sortant.
#[derive(Debug, Clone)]
pub struct FrameFields {
    pub opcode: Opcode,
    pub tenant_id: Uuid,
    pub channel_id: String,
    pub payload: String,
}

impl FrameFields {
    pub fn new(opcode: Opcode, tenant_id: Uuid) -> Self {
        Self {
            opcode,
            tenant_id,
            channel_id: String::new(),
            payload: String::new(),
        }
    }

    pub fn channel_id(mut self, channel_id: impl Into<String>) -> Self {
        self.channel_id = channel_id.into();
        self
    }

    pub fn payload(mut self, payload: impl Into<String>) -> Self {
        self.payload = payload.into();
        self
    }
}

/// Encode un frame sortant, checksummé et paddé à 256 octets. Tronque
/// silencieusement `channel_id`/`payload` s'ils dépassent la largeur de
/// leur champ (24 et 211 octets), sur une frontière de caractère UTF-8
/// valide — jamais de panique sur une entrée applicative surdimensionnée.
pub fn encode_frame(fields: FrameFields) -> [u8; FRAME_SIZE] {
    let mut buf = [0u8; FRAME_SIZE];

    buf[OFF_MAGIC..OFF_MAGIC + 2].copy_from_slice(&MAGIC.to_be_bytes());
    buf[OFF_OPCODE] = fields.opcode as u8;
    buf[OFF_TENANT..OFF_TENANT + LEN_TENANT].copy_from_slice(fields.tenant_id.as_bytes());

    write_padded(&mut buf[OFF_CHANNEL..OFF_CHANNEL + LEN_CHANNEL], &fields.channel_id);
    write_padded(&mut buf[OFF_PAYLOAD..OFF_PAYLOAD + LEN_PAYLOAD], &fields.payload);

    let crc = crc16_ccitt_false(&buf[0..OFF_CRC]);
    buf[OFF_CRC..OFF_CRC + LEN_CRC].copy_from_slice(&crc.to_be_bytes());

    buf
}

/// Décode et valide intégralement un buffer de 256 octets. Ordre de
/// validation identique au serveur : longueur → magic → opcode → CRC16 → UTF-8.
pub fn decode_frame(buf: &[u8]) -> Result<DecodedFrame, ProtocolError> {
    if buf.len() != FRAME_SIZE {
        return Err(ProtocolError::InvalidLength(buf.len()));
    }

    let magic = u16::from_be_bytes([buf[OFF_MAGIC], buf[OFF_MAGIC + 1]]);
    if magic != MAGIC {
        return Err(ProtocolError::BadMagic(magic));
    }

    let opcode = Opcode::try_from(buf[OFF_OPCODE])?;

    let expected_crc = u16::from_be_bytes([buf[OFF_CRC], buf[OFF_CRC + 1]]);
    let actual_crc = crc16_ccitt_false(&buf[0..OFF_CRC]);
    if expected_crc != actual_crc {
        return Err(ProtocolError::ChecksumMismatch {
            expected: expected_crc,
            actual: actual_crc,
        });
    }

    let tenant_bytes: [u8; LEN_TENANT] = buf[OFF_TENANT..OFF_TENANT + LEN_TENANT]
        .try_into()
        .expect("slice de longueur statiquement LEN_TENANT");
    let tenant_id = Uuid::from_bytes(tenant_bytes);

    let channel_id = std::str::from_utf8(&buf[OFF_CHANNEL..OFF_CHANNEL + LEN_CHANNEL])
        .map_err(|_| ProtocolError::InvalidUtf8)?
        .trim_end_matches('\0')
        .to_string();

    let payload = std::str::from_utf8(&buf[OFF_PAYLOAD..OFF_PAYLOAD + LEN_PAYLOAD])
        .map_err(|_| ProtocolError::InvalidUtf8)?
        .trim_end_matches('\0')
        .to_string();

    Ok(DecodedFrame {
        opcode,
        tenant_id,
        channel_id,
        payload,
    })
}

fn write_padded(dst: &mut [u8], s: &str) {
    let bytes = s.as_bytes();
    let take = if bytes.len() > dst.len() {
        let mut i = dst.len();
        while i > 0 && !s.is_char_boundary(i) {
            i -= 1;
        }
        i
    } else {
        bytes.len()
    };
    dst[..take].copy_from_slice(&bytes[..take]);
}

/// CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — identique au serveur.
pub fn crc16_ccitt_false(data: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

/// Correspondance de glob simple (`*` = n'importe quelle sous-chaîne),
/// portée depuis `glob_match` dans `state.rs`. Le serveur ne renvoie que
/// le canal concret réel dans chaque frame, jamais le motif d'origine —
/// c'est au client de refaire la correspondance pour router vers les bons
/// abonnés locaux (cf. `client.rs::dispatch`).
pub fn glob_match(pattern: &str, candidate: &str) -> bool {
    fn helper(p: &[u8], c: &[u8]) -> bool {
        match p.first() {
            None => c.is_empty(),
            Some(b'*') => (0..=c.len()).any(|i| helper(&p[1..], &c[i..])),
            Some(pc) => c.first() == Some(pc) && helper(&p[1..], &c[1..]),
        }
    }
    helper(pattern.as_bytes(), candidate.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_tenant() -> Uuid {
        Uuid::from_u128(0x1234_5678_9abc_def0_1122_3344_5566_7788)
    }

    #[test]
    fn encode_then_decode_roundtrip() {
        let tenant = sample_tenant();
        let raw = encode_frame(
            FrameFields::new(Opcode::Publish, tenant)
                .channel_id("room-42")
                .payload("hello world"),
        );
        let frame = decode_frame(&raw).unwrap();
        assert_eq!(frame.opcode, Opcode::Publish);
        assert_eq!(frame.tenant_id, tenant);
        assert_eq!(frame.channel_id, "room-42");
        assert_eq!(frame.payload, "hello world");
    }

    #[test]
    fn rejects_wrong_length() {
        assert_eq!(decode_frame(&[0u8; 10]), Err(ProtocolError::InvalidLength(10)));
    }

    #[test]
    fn rejects_corrupted_checksum() {
        let mut raw = encode_frame(FrameFields::new(Opcode::Message, sample_tenant()).payload("data"));
        raw[50] ^= 0xFF;
        assert!(matches!(decode_frame(&raw), Err(ProtocolError::ChecksumMismatch { .. })));
    }

    #[test]
    fn unsub_opcode_roundtrip() {
        let raw = encode_frame(FrameFields::new(Opcode::Unsub, sample_tenant()).channel_id("room-42"));
        let frame = decode_frame(&raw).unwrap();
        assert_eq!(frame.opcode, Opcode::Unsub);
        assert_eq!(frame.channel_id, "room-42");
    }

    #[test]
    fn glob_match_basic_cases() {
        assert!(glob_match("orders:*", "orders:42"));
        assert!(!glob_match("orders:*", "invoices:42"));
        assert!(glob_match("app_123:*:eu", "app_123:orders:eu"));
    }
}
