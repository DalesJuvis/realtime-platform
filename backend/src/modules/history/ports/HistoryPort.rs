//! # HistoryPort
//!
//! **Action:** Port interface for durable channel-history storage, backing
//! the REPLAY opcode beyond what `ChannelStateRepository::HistoryBuffer`'s
//! in-memory ring buffer can offer (bounded to `DEFAULT_HISTORY_CAPACITY`
//! entries, wiped on restart, per-instance only).
//! **Input:** A `ChannelKey` plus a frame (`persist`) or a cutoff
//! timestamp (`since`).
//! **Output:** None (`persist`); matching frames, chronological (`since`).
//! **Side effects:** Implementation-defined (typically outbound network I/O).
//! **Dependencies:** `entities::ChannelKey`, `entities::Frame`.
//!
//! `persist` stays a synchronous, fire-and-forget method — same contract
//! as `ClusterBroadcastPort::broadcast`/`WebPushPort::submit`: an
//! implementation must never let a slow/unavailable backing store slow
//! down the realtime publish path. `since` is the one genuinely `async`
//! port method in this codebase: unlike every fire-and-forget port above,
//! REPLAY is a request/response operation whose caller (already
//! `.await`-ing the read) needs the actual result before it can answer
//! the client — see `ReplayHistoryUseCase`'s own doc comment for the
//! resulting, deliberate exception to `DispatchFrameUseCase`'s
//! "processing latency excludes network I/O" rule.

use async_trait::async_trait;

use crate::entities::ChannelKey::ChannelKey;
use crate::entities::Frame::FRAME_SIZE;

#[async_trait]
pub trait HistoryPort: Send + Sync {
    /// Persists a frame already delivered locally. Non-blocking: an
    /// implementation must drop/queue rather than await the write inline.
    fn persist(&self, key: &ChannelKey, frame: [u8; FRAME_SIZE]);

    /// Frames persisted on `key` strictly after `since_unix_secs`, in
    /// chronological order. `0` returns everything the backing store still
    /// retains (subject to its own retention/trim policy — unlike the
    /// in-memory ring buffer, "everything" here can be a lot more than
    /// `DEFAULT_HISTORY_CAPACITY`, but it's still not unbounded).
    async fn since(&self, key: &ChannelKey, since_unix_secs: u64) -> Vec<[u8; FRAME_SIZE]>;
}
