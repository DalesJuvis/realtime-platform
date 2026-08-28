//! # PushSubscription
//!
//! **Action:** A browser's Web Push registration (VAPID) for a tenant's
//! end-user, plus the channels it wants pushed while it has no live
//! WebSocket connection.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`.

use crate::entities::ChannelKey::TenantId;

#[derive(Debug, Clone)]
pub struct PushSubscription {
    /// The push service URL this browser registered with — unique per
    /// subscription, see `PushSubscriptionRepository`'s doc comment.
    pub endpoint: String,
    pub tenant_id: TenantId,
    /// Same identity as a WS/HTTP client token's `sub` claim.
    pub sub: String,
    /// Base64url (no padding), 65-byte uncompressed P-256 point — the
    /// subscriber's ECDH public key, from `PushSubscription.keys.p256dh`
    /// in the browser's `PushManager.subscribe()` result.
    pub p256dh_key: String,
    /// Base64url (no padding), 16 raw bytes — from `keys.auth`.
    pub auth_key: String,
    /// Channel ids or `orders:*`-style patterns this subscription wants
    /// pushed, matched the same way as a live WS `SUB` (see
    /// `PushSubscriptionRepository::find_matching`).
    pub channels: Vec<String>,
}
