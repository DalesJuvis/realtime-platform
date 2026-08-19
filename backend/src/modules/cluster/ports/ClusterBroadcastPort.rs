//! # ClusterBroadcastPort
//!
//! **Action:** Port interface for inter-instance frame fan-out, per the
//! Strategy/Adapter pattern (BACKEND.md §10).
//! **Input:** An already locally-delivered frame.
//! **Output:** None (fire-and-forget fan-out to other instances).
//! **Side effects:** Implementation-defined.
//! **Dependencies:** `entities::Frame`.

use uuid::Uuid;

use crate::entities::Frame::FRAME_SIZE;

pub trait ClusterBroadcastPort: Send + Sync {
    /// Fans a locally-delivered frame out to other instances of the
    /// cluster. Non-blocking: an implementation must drop the frame rather
    /// than slow down the local publish path if its outbound queue is full.
    fn broadcast(&self, frame: [u8; FRAME_SIZE]);

    fn instance_id(&self) -> Uuid;
}
