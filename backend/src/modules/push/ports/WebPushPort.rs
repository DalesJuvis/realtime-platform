//! # WebPushPort
//!
//! **Action:** Port interface for browser Web Push delivery — the
//! `WebPushJob` counterpart of `PushPort`, kept as a separate trait rather
//! than folded into it because a Web Push subscription carries structured
//! data (`endpoint` + two keys) that a plain device-token string
//! (`PushJob::target_tokens`) can't represent.
//! **Input:** `WebPushJob`.
//! **Output:** None (fire-and-forget, non-blocking).
//! **Side effects:** Implementation-defined (typically outbound HTTP calls).
//! **Dependencies:** `dto::WebPushJob`.

use crate::modules::push::dto::WebPushJob::WebPushJob;

pub trait WebPushPort: Send + Sync {
    /// Submits a push job, non-blocking: an implementation must never let
    /// a slow/unavailable push service slow down the realtime publish path.
    fn submit(&self, job: WebPushJob);
}
