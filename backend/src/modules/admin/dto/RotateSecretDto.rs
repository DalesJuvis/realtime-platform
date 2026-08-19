//! # RotateSecretDto
//!
//! **Action:** Request body shape for `PUT /api/v1/admin/tenants/:id/secret`.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `serde`.

use serde::Deserialize;

#[derive(Deserialize)]
pub struct RotateSecretDto {
    /// Optional: a new random secret is generated if omitted.
    pub secret: Option<String>,
}
