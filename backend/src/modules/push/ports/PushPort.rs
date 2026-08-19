//! # PushPort
//!
//! **Action:** Port interface for push-notification fallback providers,
//! per the Strategy/Adapter pattern (BACKEND.md §10/§19).
//! **Input:** `PushJob`.
//! **Output:** None (fire-and-forget, non-blocking).
//! **Side effects:** Implementation-defined (typically an outbound HTTP call).
//! **Dependencies:** `dto::PushJob`.

use crate::modules::push::dto::PushJob::PushJob;

pub trait PushPort: Send + Sync {
    /// Submits a push job, non-blocking: an implementation must never let
    /// a slow/unavailable provider slow down the realtime publish path.
    fn submit(&self, job: PushJob);
}
