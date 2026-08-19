//! # PresenceEvent
//!
//! **Action:** Presence event kind, encoded in the payload of the frame
//! published on a channel's `{channel}-presence` meta-channel as `"EVENT:session_id"`.
//! **Input:** N/A (enum).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** None.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresenceEvent {
    Join,
    Leave,
    Timeout,
}

impl PresenceEvent {
    pub fn as_str(self) -> &'static str {
        match self {
            PresenceEvent::Join => "JOIN",
            PresenceEvent::Leave => "LEAVE",
            PresenceEvent::Timeout => "TIMEOUT",
        }
    }
}
