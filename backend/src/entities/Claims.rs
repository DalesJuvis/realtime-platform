//! # Claims
//!
//! **Action:** Decoded claims of a validated auth token.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `serde`, `entities::ChannelKey`.

use serde::{Deserialize, Serialize};

use crate::entities::ChannelKey::TenantId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Claims {
    pub tenant_id: TenantId,
    pub sub: String,
    pub exp: u64,
}
