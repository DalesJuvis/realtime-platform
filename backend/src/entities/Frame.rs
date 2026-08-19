//! # Frame
//!
//! **Action:** Zero-copy parser/encoder for the fixed 256-byte binary wire frame.
//! **Input:** Raw `&[u8; 256]` buffers read from a WebSocket or TCP socket.
//! **Output:** Parsed `Frame<'a>` views, or owned buffers built by `FrameBuilder`.
//! **Side effects:** None — pure encoding/decoding.
//! **Dependencies:** `uuid`.
//!
//! Frame layout (256 bytes, big-endian):
//! ```text
//! Offset    Size     Field
//! ------    ------   -----------------------------------------
//! 0..2      2        Magic + Version   (0xAA01)
//! 2..3      1        Opcode
//! 3..19     16       Tenant ID (raw UUID, 16 bytes)
//! 19..43    24       Channel ID (UTF-8, zero-padded)
//! 43..254   211      Payload (UTF-8, zero-padded)
//! 254..256  2        CRC16/CCITT-FALSE over bytes [0..254)
//! ```
//!
//! Parsing operates directly on `&[u8; 256]`: no heap allocation while
//! reading. `channel_id()`/`payload()` return borrowed `&str` (zero-copy);
//! only `tenant_id()` copies 16 bytes to build a `Uuid` (cheap `Copy` type).

use std::convert::TryFrom;
use std::fmt;
use uuid::Uuid;

/// Fixed on-wire frame size.
pub const FRAME_SIZE: usize = 256;

/// Protocol magic + version identifier. Checking it first lets a stream
/// that isn't this protocol be rejected cheaply, before paying the CRC cost.
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

/// Opcodes carried in byte 2 of the frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Opcode {
    Subscribe = 0x01,
    Publish = 0x02,
    Message = 0x03,
    Auth = 0x04,
    Ping = 0x05,
    Presence = 0x06,
    /// Catch-up request: client sends a Unix timestamp (decimal ASCII) in
    /// the payload; server replays frames published on that channel since.
    Replay = 0x07,
    /// Direct send to a specific user, bypassing an explicit channel name.
    /// `channel_id` is **repurposed**: it carries the recipient's user
    /// identifier (the `sub` of the AUTH token issued for this tenant), not
    /// a channel name. The server resolves it internally to that user's
    /// private inbox (channel `user:{user_id}`), which every session
    /// auto-subscribes to on successful AUTH. Direct consequence of the
    /// fixed 256-byte frame: the application-chosen user ID must fit in the
    /// 24-byte `channel_id` field (a textual UUID v4, 36 chars, does not
    /// fit — prefer a short identifier or truncated hash for socket
    /// addressing).
    Unicast = 0x08,
    /// Explicit unsubscription from an already-subscribed channel/pattern.
    /// `channel_id` carries the exact channel/pattern used at the original
    /// SUB.
    Unsub = 0x09,
}

impl Opcode {
    /// Short, stable label used as a Prometheus metric label value — more
    /// readable in Grafana than the raw opcode byte.
    pub fn label(self) -> &'static str {
        match self {
            Opcode::Subscribe => "SUB",
            Opcode::Publish => "PUB",
            Opcode::Message => "MSG",
            Opcode::Auth => "AUTH",
            Opcode::Ping => "PING",
            Opcode::Presence => "PRESENCE",
            Opcode::Replay => "REPLAY",
            Opcode::Unicast => "UNICAST",
            Opcode::Unsub => "UNSUB",
        }
    }
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

/// Errors raised while decoding a raw buffer into a `Frame`.
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
                write!(f, "invalid frame length: expected {FRAME_SIZE}, got {n}")
            }
            ProtocolError::BadMagic(m) => write!(f, "invalid magic/version: 0x{m:04X}"),
            ProtocolError::UnknownOpcode(o) => write!(f, "unknown opcode: 0x{o:02X}"),
            ProtocolError::ChecksumMismatch { expected, actual } => write!(
                f,
                "invalid CRC16: frame announces 0x{expected:04X}, computed 0x{actual:04X}"
            ),
            ProtocolError::InvalidUtf8 => write!(f, "non-UTF-8 channel/payload section"),
        }
    }
}

impl std::error::Error for ProtocolError {}

/// Parsed view over a raw 256-byte frame. Borrows the underlying buffer
/// (`&'a [u8; FRAME_SIZE]`): no allocation happens while parsing.
#[derive(Debug)]
pub struct Frame<'a> {
    raw: &'a [u8; FRAME_SIZE],
    opcode: Opcode,
}

impl<'a> Frame<'a> {
    /// Fully parses and validates a 256-byte buffer.
    ///
    /// Validation order: magic → opcode → CRC16 → UTF-8, so a corrupted or
    /// off-protocol stream is rejected as cheaply as possible.
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

        std::str::from_utf8(&buf[OFF_CHANNEL..OFF_CHANNEL + LEN_CHANNEL])
            .map_err(|_| ProtocolError::InvalidUtf8)?;
        std::str::from_utf8(&buf[OFF_PAYLOAD..OFF_PAYLOAD + LEN_PAYLOAD])
            .map_err(|_| ProtocolError::InvalidUtf8)?;

        Ok(Frame { raw: buf, opcode })
    }

    /// Parses from an arbitrary-length slice (e.g. bytes read off a
    /// socket), checking length first.
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

    #[inline]
    pub fn tenant_id(&self) -> Uuid {
        let mut bytes = [0u8; LEN_TENANT];
        bytes.copy_from_slice(&self.raw[OFF_TENANT..OFF_TENANT + LEN_TENANT]);
        Uuid::from_bytes(bytes)
    }

    #[inline]
    pub fn tenant_id_bytes(&self) -> [u8; LEN_TENANT] {
        self.raw[OFF_TENANT..OFF_TENANT + LEN_TENANT]
            .try_into()
            .expect("slice length is statically LEN_TENANT")
    }

    /// Channel ID, stripped of trailing NUL padding. Borrowed, zero-copy.
    #[inline]
    pub fn channel_id(&self) -> &str {
        let slice = &self.raw[OFF_CHANNEL..OFF_CHANNEL + LEN_CHANNEL];
        // Safe: UTF-8 validity of this section was already checked in `parse`,
        // and trimming trailing NUL bytes off valid UTF-8 stays valid UTF-8.
        let s = unsafe { std::str::from_utf8_unchecked(slice) };
        s.trim_end_matches('\0')
    }

    /// Text payload, stripped of trailing NUL padding. Borrowed, zero-copy.
    #[inline]
    pub fn payload(&self) -> &str {
        let slice = &self.raw[OFF_PAYLOAD..OFF_PAYLOAD + LEN_PAYLOAD];
        let s = unsafe { std::str::from_utf8_unchecked(slice) };
        s.trim_end_matches('\0')
    }

    /// Name of the presence meta-channel for this channel: `"{channel_id}-presence"`.
    pub fn presence_channel(&self) -> String {
        format!("{}-presence", self.channel_id())
    }

    /// Full raw buffer — useful to retransmit a frame as-is to subscribers
    /// without re-encoding it.
    #[inline]
    pub fn as_bytes(&self) -> &[u8; FRAME_SIZE] {
        self.raw
    }
}

/// Builder to encode a new outbound frame into an owned `[u8; 256]` buffer.
/// Centralizes padding, truncation, and CRC computation so this file stays
/// the single source of truth for the wire format in both directions.
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

    /// Encodes into an owned, checksummed, 256-byte-padded frame.
    ///
    /// `channel_id`/`payload` are truncated (at a valid UTF-8 character
    /// boundary) rather than panicking if they exceed their field width:
    /// this must never crash on an oversized application input.
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

/// Copies `s` into `dst`, truncated at the last UTF-8 character boundary
/// that fits, zero-padded for the remainder. `dst.len()` is the field width.
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
    // Rest of `dst` is already zero ([u8; FRAME_SIZE] is zero-initialized).
}

/// CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no xorout).
///
/// Implemented bit-by-bit rather than with a lookup table: at 254
/// bytes/frame this is plenty fast, and it avoids growing the binary —
/// which matters for the `scratch` Docker target (< 20 MB).
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

        let frame = Frame::parse(&raw).expect("frame must parse");
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
        raw[0] = 0x00;
        let err = Frame::parse(&raw).unwrap_err();
        assert!(matches!(err, ProtocolError::BadMagic(_)));
    }

    #[test]
    fn rejects_unknown_opcode() {
        let mut raw = FrameBuilder::new(Opcode::Ping, sample_tenant()).build();
        raw[2] = 0xFF;
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
        raw[50] ^= 0xFF;
        let err = Frame::parse(&raw).unwrap_err();
        assert!(matches!(err, ProtocolError::ChecksumMismatch { .. }));
    }

    #[test]
    fn truncates_oversized_fields_at_char_boundary() {
        let long_channel = "x".repeat(100);
        let raw = FrameBuilder::new(Opcode::Subscribe, sample_tenant())
            .channel_id(long_channel)
            .build();
        let frame = Frame::parse(&raw).unwrap();
        assert_eq!(frame.channel_id().len(), LEN_CHANNEL);
    }

    #[test]
    fn unicast_opcode_roundtrip() {
        let raw = FrameBuilder::new(Opcode::Unicast, sample_tenant())
            .channel_id("user-42")
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
