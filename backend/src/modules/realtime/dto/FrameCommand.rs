//! # FrameCommand
//!
//! **Action:** Result of processing one inbound frame, shared between the
//! WebSocket and TCP controllers so transport-specific code never
//! duplicates business logic.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::Frame`.

use tokio::sync::broadcast;

use crate::entities::Frame::FRAME_SIZE;

pub enum FrameCommand {
    /// A subscription was accepted: `key` (exact channel or pattern)
    /// indexes the relay task at the caller, so a later UNSUB can
    /// `abort()` precisely the right one among several.
    Subscribed(String, broadcast::Receiver<[u8; FRAME_SIZE]>),
    /// Unsubscription from a specific channel or pattern (UNSUB opcode):
    /// the caller must `abort()` then remove the associated relay task.
    Unsubscribed(String),
    /// Response to a REPLAY opcode: historical frames to send immediately
    /// on the socket, in chronological order.
    Replayed(Vec<[u8; FRAME_SIZE]>),
    /// Nothing to do at the transport level (handled internally: AUTH,
    /// PING, PUB, or an ignored/rejected frame).
    None,
    /// The connection must be closed (invalid AUTH, explicit close).
    Close,
}
