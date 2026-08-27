//! # LoginDto
//!
//! **Action:** Request body for `POST /api/v1/portal/auth/login`.

use serde::Deserialize;

#[derive(Deserialize)]
pub struct LoginDto {
    pub email: String,
    pub password: String,
}
