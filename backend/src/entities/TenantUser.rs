//! # TenantUser
//!
//! **Action:** A tenant's own portal login account — distinct from the
//! platform Admin API's single static token, and from the tenant's HMAC
//! secret (used only to prove ownership at registration, never stored here).
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`, `uuid`, `chrono`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;

pub type TenantUserId = Uuid;

#[derive(Debug, Clone)]
pub struct TenantUser {
    pub id: TenantUserId,
    pub tenant_id: TenantId,
    pub email: String,
    pub password_hash: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
