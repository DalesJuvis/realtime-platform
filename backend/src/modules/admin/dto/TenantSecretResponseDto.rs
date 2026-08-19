//! # TenantSecretResponseDto
//!
//! **Action:** Response body shape carrying a tenant's freshly (re)generated secret.
//! **Input:** N/A (data type).
//! **Output:** N/A — shown only once, like a password: never stored or re-logged in clear.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `serde`, `uuid`.

use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct TenantSecretResponseDto {
    pub tenant_id: Uuid,
    pub secret: String,
}
