//! # RegisterDto
//!
//! **Action:** Request body for `POST /api/v1/portal/auth/register`.
//! Proves the caller controls the tenant by requiring its real secret —
//! the same one an admin got back once from `POST /api/v1/admin/tenants`.

use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct RegisterDto {
    pub tenant_id: Uuid,
    pub secret: String,
    pub email: String,
    pub password: String,
}
