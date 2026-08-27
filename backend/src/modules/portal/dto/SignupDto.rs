//! # SignupDto
//!
//! **Action:** Request body for `POST /api/v1/portal/auth/signup` — the
//! self-serve "create account" flow: unlike `RegisterDto` (which proves
//! ownership of a tenant an admin already provisioned), this creates a
//! brand-new tenant + key pair on the spot. No `tenant_id`/`secret` input:
//! there is nothing to prove ownership of yet.

use serde::Deserialize;

#[derive(Deserialize)]
pub struct SignupDto {
    pub email: String,
    pub password: String,
}
