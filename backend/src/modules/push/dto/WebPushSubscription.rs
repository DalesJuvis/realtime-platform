//! # WebPushSubscription (push job DTO)
//!
//! **Action:** The subset of `entities::PushSubscription` a
//! `WebPushAdapter` send actually needs — no `tenant_id`/`sub`/`channels`,
//! those already did their job resolving *which* subscriptions to submit
//! (see `PushSubscriptionRepository::find_matching`) before a `WebPushJob`
//! is ever built.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** None.

#[derive(Debug, Clone)]
pub struct WebPushSubscription {
    pub endpoint: String,
    pub p256dh_key: String,
    pub auth_key: String,
}
