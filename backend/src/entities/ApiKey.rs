//! # ApiKey
//!
//! **Action:** A named, independently-revocable API key pair — additive
//! to (not a replacement for) the tenant's own signup-issued primary
//! secret (see `TenantUser`'s doc comment on that one). `public_key` is
//! its own independently-generated identifier, never `tenant_id` reused
//! under a second name — see `ApiKeyRepository`'s own doc comment for why
//! that specific shortcut was wrong.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`, `uuid`, `chrono`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;

pub type ApiKeyId = Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiKeyStatus {
    Active,
    Revoked,
}

impl ApiKeyStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ApiKeyStatus::Active => "active",
            ApiKeyStatus::Revoked => "revoked",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "revoked" => ApiKeyStatus::Revoked,
            _ => ApiKeyStatus::Active,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApiKey {
    pub id: ApiKeyId,
    pub tenant_id: TenantId,
    pub name: String,
    pub public_key: String,
    /// Never serialized back to the client after creation — see
    /// `ApiKeyDto`'s doc comment: this field only exists on the record
    /// returned at creation time, not on list/read responses.
    pub secret: String,
    pub status: ApiKeyStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub revoked_at: Option<chrono::DateTime<chrono::Utc>>,
}
