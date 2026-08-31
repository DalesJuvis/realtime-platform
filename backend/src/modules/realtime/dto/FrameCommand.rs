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
    /// AUTH was rejected (bad signature, unknown tenant, or an expired
    /// token — `TokenService::validate`'s own distinct `AuthError`
    /// variants, not preserved past this point since the client-side
    /// remedy is identical either way: mint a fresh token). The only
    /// producer of this variant today — see its own module doc comment
    /// before adding a second one with a different meaning. `WsController`
    /// sends a WS close code for this (`4001`); `TcpController` has no
    /// such concept and just closes the stream.
    CloseAuthFailed,
}
