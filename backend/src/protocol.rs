//! `protocol.rs` — Parser/encodeur binaire zero-copy pour le frame fixe de 256 octets.
//!
//! Layout du frame (256 octets, big-endian) :
//! ```text
//! Offset    Taille   Champ
//! ------    ------   -----------------------------------------
//! 0..2      2        Magic + Version   (0xAA01)
//! 2..3      1        Opcode
//! 3..19     16       Tenant ID (UUID brut, 16 octets)
//! 19..43    24       Channel ID (UTF-8, paddé à zéro)
//! 43..254   211      Payload (UTF-8, paddé à zéro)
//! 254..256  2        CRC16/CCITT-FALSE sur les octets [0..254)
//! ```
//!
//! Le parsing s'effectue directement sur des `&[u8; 256]` : aucune
//! allocation heap pendant la lecture. Les accesseurs `channel_id()` et
//! `payload()` renvoient des `&str` empruntés (zero-copy) ; seul
//! `tenant_id()` copie 16 octets pour construire un `Uuid` (type `Copy`
//! bon marché).

use std::convert::TryFrom;
use std::fmt;
use uuid::Uuid;

/// Taille fixe d'un frame sur le fil. Imposée par la contrainte #1.
pub const FRAME_SIZE: usize = 256;

/// Identifiant magique + version de protocole. Le fait de le vérifier en
/// premier permet de rejeter très vite un flux qui n'est pas de ce
/// protocole, avant de payer le coût du calcul CRC.
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

// Vérification statique que le layout tombe exactement sur FRAME_SIZE.
const _: () = assert!(OFF_CRC + LEN_CRC == FRAME_SIZE);

/// Opcodes portés par l'octet 2 du frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Opcode {
    Subscribe = 0x01,
    Publish = 0x02,
    Message = 0x03,
    Auth = 0x04,
    Ping = 0x05,
    Presence = 0x06,
    /// Demande de rattrapage : le client envoie un timestamp Unix (en
    /// texte ASCII décimal) dans le payload, le serveur répond en
    /// retransmettant les frames publiés sur ce canal depuis ce moment
    /// (roadmap "Historique et Rétention / Catch-up").
    Replay = 0x07,
    /// Envoi direct à un utilisateur précis, sans passer par un nom de
    /// canal explicite (roadmap "Mode Direct User-to-User / Unicast").
    /// Le champ `channel_id` est **repurposé** : il porte l'identifiant
    /// de l'utilisateur destinataire (le `sub` du jeton AUTH émis pour
    /// ce tenant), pas un nom de canal. Le serveur résout en interne vers
    /// la boîte privée de cet utilisateur (canal `user:{user_id}`), à
    /// laquelle chaque session est automatiquement abonnée dès un AUTH
    /// réussi. Conséquence directe du format 256 octets fixe : l'ID
    /// utilisateur choisi côté application doit tenir dans les 24 octets
    /// du champ `channel_id` (un UUID v4 en texte, 36 caractères, ne
    /// rentre pas — préférer un identifiant court ou un hash tronqué pour
    /// l'adressage socket).
    Unicast = 0x08,
    /// Désabonnement explicite d'un canal ou motif déjà souscrit.
    /// `channel_id` porte le canal/motif exact tel qu'utilisé au SUB
    /// d'origine. Corrige la limitation historique du protocole (v1..v8)
    /// où aucun mécanisme ne permettait de se désabonner sans fermer la
    /// connexion — cf. `main.rs::process_frame_inner`, bras
    /// `Opcode::Unsub`, qui `abort()` la tâche de relais correspondante.
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

/// Erreurs possibles lors du décodage d'un buffer brut en `Frame`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProtocolError {
    /// Le buffer passé à `Frame::parse_slice` ne fait pas 256 octets.
    InvalidLength(usize),
    /// Le préfixe magic/version ne correspond pas à `MAGIC`.
    BadMagic(u16),
    /// L'octet 2 ne correspond à aucun `Opcode` connu.
    UnknownOpcode(u8),
    /// Le CRC16 calculé ne correspond pas au checksum embarqué.
    ChecksumMismatch { expected: u16, actual: u16 },
    /// La section channel ou payload contient des octets UTF-8 invalides.
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

/// Vue parsée sur un frame brut de 256 octets.
///
/// `Frame` emprunte le buffer sous-jacent (`&'a [u8; FRAME_SIZE]`) : aucune
/// allocation n'a lieu pendant le parsing.
pub struct Frame<'a> {
    raw: &'a [u8; FRAME_SIZE],
    opcode: Opcode,
}

impl<'a> Frame<'a> {
    /// Parse et valide intégralement un buffer de 256 octets.
    ///
    /// Ordre de validation : magic → opcode → CRC16 → UTF-8. Cet ordre
    /// permet de rejeter le plus tôt possible un flux corrompu ou hors
    /// protocole sans payer le coût du CRC dans ce cas.
    pub fn parse(buf: &'a [u8; FRAME_SIZE]) -> Result<Self, ProtocolError> {
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

        // Validation UTF-8 en amont pour que les accesseurs soient infaillibles.
        std::str::from_utf8(&buf[OFF_CHANNEL..OFF_CHANNEL + LEN_CHANNEL])
            .map_err(|_| ProtocolError::InvalidUtf8)?;
        std::str::from_utf8(&buf[OFF_PAYLOAD..OFF_PAYLOAD + LEN_PAYLOAD])
            .map_err(|_| ProtocolError::InvalidUtf8)?;

        Ok(Frame { raw: buf, opcode })
    }

    /// Parse depuis un slice de taille arbitraire (ex: `BytesMut` lu sur
    /// un socket), en vérifiant d'abord la longueur.
    pub fn parse_slice(buf: &'a [u8]) -> Result<Self, ProtocolError> {
        let arr: &[u8; FRAME_SIZE] = buf
            .try_into()
            .map_err(|_| ProtocolError::InvalidLength(buf.len()))?;
        Self::parse(arr)
    }

    #[inline]
    pub fn opcode(&self) -> Opcode {
        self.opcode
    }

    /// Tenant ID sous forme de `Uuid`. Copie 16 octets (pas d'alloc heap).
    #[inline]
    pub fn tenant_id(&self) -> Uuid {
        let mut bytes = [0u8; LEN_TENANT];
        bytes.copy_from_slice(&self.raw[OFF_TENANT..OFF_TENANT + LEN_TENANT]);
        Uuid::from_bytes(bytes)
    }

    /// Octets bruts du tenant ID — utile comme clé de map sans construire
    /// un `Uuid` quand seule l'égalité/le hash comptent.
    #[inline]
    pub fn tenant_id_bytes(&self) -> [u8; LEN_TENANT] {
        self.raw[OFF_TENANT..OFF_TENANT + LEN_TENANT]
            .try_into()
            .expect("la longueur du slice est statiquement LEN_TENANT")
    }

    /// Channel ID, débarrassé du padding NUL final. Emprunté, zero-copy.
    #[inline]
    pub fn channel_id(&self) -> &str {
        let slice = &self.raw[OFF_CHANNEL..OFF_CHANNEL + LEN_CHANNEL];
        // Sûr : la validité UTF-8 de cette section a déjà été vérifiée
        // dans `parse`, et tronquer des octets NUL finaux d'un UTF-8
        // valide produit toujours un UTF-8 valide.
        let s = unsafe { std::str::from_utf8_unchecked(slice) };
        s.trim_end_matches('\0')
    }

    /// Payload texte, débarrassé du padding NUL final. Emprunté, zero-copy.
    #[inline]
    pub fn payload(&self) -> &str {
        let slice = &self.raw[OFF_PAYLOAD..OFF_PAYLOAD + LEN_PAYLOAD];
        let s = unsafe { std::str::from_utf8_unchecked(slice) };
        s.trim_end_matches('\0')
    }

    /// Nom du méta-canal de présence associé à ce channel :
    /// `"{channel_id}-presence"`.
    pub fn presence_channel(&self) -> String {
        format!("{}-presence", self.channel_id())
    }

    /// Accès au buffer brut complet — utile pour retransmettre un frame
    /// tel quel à des abonnés sans le ré-encoder.
    #[inline]
    pub fn as_bytes(&self) -> &[u8; FRAME_SIZE] {
        self.raw
    }
}

/// Builder pour encoder un nouveau frame sortant dans un buffer possédé
/// `[u8; 256]`. Centralise le padding, la troncature et le calcul du CRC
/// afin que `protocol.rs` reste l'unique source de vérité du format fil
/// dans les deux sens (lecture/écriture).
pub struct FrameBuilder {
    opcode: Opcode,
    tenant_id: Uuid,
    channel_id: String,
    payload: String,
}

impl FrameBuilder {
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

    /// Encode en un frame possédé, checksummé et paddé à 256 octets.
    ///
    /// `channel_id` et `payload` sont tronqués (sur une frontière de
    /// caractère UTF-8 valide) s'ils dépassent la largeur de leur champ,
    /// plutôt que de paniquer : ce service ne doit jamais crasher sur une
    /// entrée applicative surdimensionnée.
    pub fn build(self) -> [u8; FRAME_SIZE] {
        let mut buf = [0u8; FRAME_SIZE];

        buf[OFF_MAGIC..OFF_MAGIC + 2].copy_from_slice(&MAGIC.to_be_bytes());
        buf[OFF_OPCODE] = self.opcode as u8;
        buf[OFF_TENANT..OFF_TENANT + LEN_TENANT].copy_from_slice(self.tenant_id.as_bytes());

        write_padded(
            &mut buf[OFF_CHANNEL..OFF_CHANNEL + LEN_CHANNEL],
            &self.channel_id,
        );
        write_padded(
            &mut buf[OFF_PAYLOAD..OFF_PAYLOAD + LEN_PAYLOAD],
            &self.payload,
        );

        let crc = crc16_ccitt_false(&buf[0..OFF_CRC]);
        buf[OFF_CRC..OFF_CRC + LEN_CRC].copy_from_slice(&crc.to_be_bytes());

        buf
    }
}

/// Copie `s` dans `dst`, tronqué à la dernière frontière de caractère
/// UTF-8 qui tient, et paddé à zéro pour le reste. `dst.len()` est la
/// largeur du champ.
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
    // Le reste de `dst` est déjà à zéro (buffer [u8; FRAME_SIZE] initialisé à 0).
}

/// CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF, pas de reflet, pas de xorout).
///
/// Implémenté en boucle bit-à-bit plutôt qu'avec une table de lookup :
/// à 254 octets/frame c'est largement assez rapide, et ça évite de gonfler
/// le binaire — ce qui compte pour la cible Docker `scratch` < 20 Mo.
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_tenant() -> Uuid {
        Uuid::from_u128(0x1234_5678_9abc_def0_1122_3344_5566_7788)
    }

    #[test]
    fn build_then_parse_roundtrip() {
        let tenant = sample_tenant();
        let raw = FrameBuilder::new(Opcode::Publish, tenant)
            .channel_id("room-42")
            .payload("hello world")
            .build();

        let frame = Frame::parse(&raw).expect("le frame doit se parser");
        assert_eq!(frame.opcode(), Opcode::Publish);
        assert_eq!(frame.tenant_id(), tenant);
        assert_eq!(frame.channel_id(), "room-42");
        assert_eq!(frame.payload(), "hello world");
        assert_eq!(frame.presence_channel(), "room-42-presence");
    }

    #[test]
    fn rejects_wrong_length() {
        let buf = vec![0u8; 100];
        let err = Frame::parse_slice(&buf).unwrap_err();
        assert_eq!(err, ProtocolError::InvalidLength(100));
    }

    #[test]
    fn rejects_bad_magic() {
        let mut raw = FrameBuilder::new(Opcode::Ping, sample_tenant()).build();
        raw[0] = 0x00; // magic corrompu
        let err = Frame::parse(&raw).unwrap_err();
        assert!(matches!(err, ProtocolError::BadMagic(_)));
    }

    #[test]
    fn rejects_unknown_opcode() {
        let mut raw = FrameBuilder::new(Opcode::Ping, sample_tenant()).build();
        raw[2] = 0xFF; // opcode invalide
        // On recalcule le CRC pour isoler la vérification de l'opcode.
        let crc = crc16_ccitt_false(&raw[0..OFF_CRC]);
        raw[OFF_CRC..OFF_CRC + LEN_CRC].copy_from_slice(&crc.to_be_bytes());
        let err = Frame::parse(&raw).unwrap_err();
        assert_eq!(err, ProtocolError::UnknownOpcode(0xFF));
    }

    #[test]
    fn rejects_corrupted_checksum() {
        let mut raw = FrameBuilder::new(Opcode::Message, sample_tenant())
            .payload("data")
            .build();
        raw[50] ^= 0xFF; // altère un octet du payload sans mettre à jour le CRC
        let err = Frame::parse(&raw).unwrap_err();
        assert!(matches!(err, ProtocolError::ChecksumMismatch { .. }));
    }

    #[test]
    fn truncates_oversized_fields_at_char_boundary() {
        let long_channel = "x".repeat(100); // dépasse le champ de 24 octets
        let raw = FrameBuilder::new(Opcode::Subscribe, sample_tenant())
            .channel_id(long_channel)
            .build();
        let frame = Frame::parse(&raw).unwrap();
        assert_eq!(frame.channel_id().len(), LEN_CHANNEL);
    }

    #[test]
    fn unicast_opcode_roundtrip() {
        let raw = FrameBuilder::new(Opcode::Unicast, sample_tenant())
            .channel_id("user-42") // repurposé : identifiant du destinataire
            .payload("hey there")
            .build();
        let frame = Frame::parse(&raw).unwrap();
        assert_eq!(frame.opcode(), Opcode::Unicast);
        assert_eq!(frame.channel_id(), "user-42");
    }

    #[test]
    fn unsub_opcode_roundtrip() {
        let raw = FrameBuilder::new(Opcode::Unsub, sample_tenant())
            .channel_id("room-42")
            .build();
        let frame = Frame::parse(&raw).unwrap();
        assert_eq!(frame.opcode(), Opcode::Unsub);
        assert_eq!(frame.channel_id(), "room-42");
    }

    #[test]
    fn frame_size_is_exactly_256() {
        assert_eq!(FRAME_SIZE, 256);
        let raw = FrameBuilder::new(Opcode::Ping, sample_tenant()).build();
        assert_eq!(raw.len(), 256);
    }
}
