//! # ChannelKey
//!
//! **Action:** Composite key type enforcing strict `(TenantId, ChannelId)`
//! isolation, plus the tenant/session ID aliases and the private-inbox
//! channel naming convention used for UNICAST.
//! **Input:** A tenant UUID and a channel name.
//! **Output:** `ChannelKey` values used to index channel state everywhere.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `uuid`.

use uuid::Uuid;

/// Tenant identifier (strict multi-tenant isolation).
pub type TenantId = Uuid;

/// Connection/session identifier.
pub type SessionId = Uuid;

/// Composite key guaranteeing strict isolation by `(TenantId, ChannelId)`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ChannelKey {
    pub tenant_id: TenantId,
    pub channel_id: String,
}

impl ChannelKey {
    pub fn new(tenant_id: TenantId, channel_id: impl Into<String>) -> Self {
        Self {
            tenant_id,
            channel_id: channel_id.into(),
        }
    }

    /// Key of the associated presence meta-channel, `"{channel}-presence"`.
    pub fn presence_key(&self) -> ChannelKey {
        ChannelKey {
            tenant_id: self.tenant_id,
            channel_id: format!("{}-presence", self.channel_id),
        }
    }
}

/// Internal channel-naming convention for a user's private UNICAST inbox:
/// `"user:{user_id}"`. Every session auto-subscribes to its own inbox on
/// successful AUTH. Reserved `user:` prefix: a tenant that explicitly
/// publishes on a channel `user:xxx` via PUB will therefore also reach
/// UNICAST messages addressed to `xxx` — intentional (a single underlying
/// channel namespace), not a bug, but worth documenting client-side if
/// that isn't the desired behavior for a given tenant.
pub fn unicast_inbox_channel(user_id: &str) -> String {
    format!("user:{user_id}")
}
