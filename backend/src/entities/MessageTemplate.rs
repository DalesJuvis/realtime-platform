//! # MessageTemplate
//!
//! **Action:** A tenant's saved, reusable message body for the Templating
//! page — `{{variable}}` placeholders are a frontend-only convention; the
//! backend treats `body` as opaque text.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`, `uuid`, `chrono`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;

#[derive(Debug, Clone)]
pub struct MessageTemplate {
    pub id: Uuid,
    pub tenant_id: TenantId,
    pub name: String,
    pub body: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
