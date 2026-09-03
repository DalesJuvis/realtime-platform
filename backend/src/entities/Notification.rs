//! # Notification
//!
//! **Action:** A durable record of one published message, kept so a
//! tenant-portal user can see what they received even if they weren't
//! connected (or open the app) at the moment it was published — the
//! backing data behind the portal's notification bell.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`, `uuid`, `chrono`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;

#[derive(Debug, Clone)]
pub struct Notification {
    pub id: Uuid,
    pub tenant_id: TenantId,
    pub channel_id: String,
    pub payload: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub read_at: Option<chrono::DateTime<chrono::Utc>>,
}
