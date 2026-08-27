//! # SignupResponseDto
//!
//! **Action:** Response body for `POST /api/v1/portal/auth/signup` — a
//! portal session (log the new user straight in, like register/login)
//! plus the freshly generated key pair, shown once at creation the same
//! way an admin-provisioned secret is (see `KeyPairDto`'s doc comment);
//! it can also be re-fetched later via `GET /api/v1/portal/keys`.

use serde::Serialize;

use crate::modules::portal::dto::KeyPairDto::KeyPairDto;

#[derive(Serialize)]
pub struct SignupResponseDto {
    pub access_token: String,
    pub token_type: &'static str,
    pub expires_in: u64,
    pub keys: KeyPairDto,
}
