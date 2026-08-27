//! # SessionTokenResponseDto
//!
//! **Action:** Response body for register/login — a portal session token,
//! not a client (WS/TCP) token. See `PortalAuthService`'s doc comment for
//! how this differs from `TokenService::issue_token`.

use serde::Serialize;

#[derive(Serialize)]
pub struct SessionTokenResponseDto {
    pub access_token: String,
    pub token_type: &'static str,
    pub expires_in: u64,
}

impl SessionTokenResponseDto {
    pub fn new(access_token: String, expires_in: u64) -> Self {
        Self {
            access_token,
            token_type: "Bearer",
            expires_in,
        }
    }
}
