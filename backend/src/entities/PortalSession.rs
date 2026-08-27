//! # PortalSession
//!
//! **Action:** Decoded claims of a validated portal session token.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `serde`, `entities::ChannelKey`, `entities::TenantUser`.

use serde::{Deserialize, Serialize};

use crate::entities::ChannelKey::TenantId;
use crate::entities::TenantUser::TenantUserId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortalSession {
    pub user_id: TenantUserId,
    pub tenant_id: TenantId,
    pub email: String,
    pub exp: u64,
}
