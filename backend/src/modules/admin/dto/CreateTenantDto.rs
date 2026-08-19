//! # CreateTenantDto
//!
//! **Action:** Request body shape for `POST /api/v1/admin/tenants`.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `serde`, `uuid`, `entities::RateLimitConfig`.

use serde::Deserialize;
use uuid::Uuid;

use crate::entities::RateLimitConfig::RateLimitConfig;

#[derive(Deserialize)]
pub struct CreateTenantDto {
    /// Optional: a new v4 UUID is generated server-side if omitted.
    pub tenant_id: Option<Uuid>,
    /// Optional: a random 256-bit secret is generated if omitted.
    pub secret: Option<String>,
    /// Optional: rate-limit quotas specific to this tenant.
    pub limits: Option<RateLimitConfig>,
}
