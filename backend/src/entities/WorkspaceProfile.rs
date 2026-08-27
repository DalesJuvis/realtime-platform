//! # WorkspaceProfile
//!
//! **Action:** A tenant's optional display profile (name/website/logo) —
//! purely cosmetic, shown in the portal UI. Nothing else in the backend
//! reads it.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`.

use crate::entities::ChannelKey::TenantId;

#[derive(Debug, Clone, Default)]
pub struct WorkspaceProfile {
    pub tenant_id: TenantId,
    pub name: Option<String>,
    pub website_url: Option<String>,
    pub logo_data_uri: Option<String>,
}
