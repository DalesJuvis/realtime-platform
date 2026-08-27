//! # ChangePasswordDto
//!
//! **Action:** Request body for `PUT /api/v1/portal/account/password`.

use serde::Deserialize;

#[derive(Deserialize)]
pub struct ChangePasswordDto {
    pub current_password: String,
    pub new_password: String,
}
