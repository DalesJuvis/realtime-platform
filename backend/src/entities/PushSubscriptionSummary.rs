//! # PushSubscriptionSummary
//!
//! **Action:** A read-only view of one `PushSubscription` row for the
//! tenant-portal's device list — deliberately a separate type from
//! `entities::PushSubscription` rather than reusing it: that one doubles
//! as the *write* shape `RegisterPushSubscriptionUseCase` builds before
//! `created_at` exists yet (the repository generates it at insert time),
//! and it carries the P-256/auth crypto keys, which a portal UI has no
//! reason to ever see. This type only ever comes back out of storage.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.

#[derive(Debug, Clone)]
pub struct PushSubscriptionSummary {
    pub endpoint: String,
    /// Same identity as a WS/HTTP client token's `sub` claim — whichever
    /// end-user (or, for tenant-portal's own toggle, `tenant-portal-admin`)
    /// registered this device.
    pub sub: String,
    pub channels: Vec<String>,
    pub device_label: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
