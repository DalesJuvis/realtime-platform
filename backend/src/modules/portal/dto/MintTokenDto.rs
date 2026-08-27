//! # MintTokenDto
//!
//! **Action:** Request/response bodies for `POST /api/v1/portal/tokens` —
//! mints a client (WS/TCP) token for the caller's own tenant, server-side,
//! so the tenant's raw HMAC secret never has to leave the server for this.

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct MintTokenDto {
    pub sub: String,
    /// Defaults to 3600 (1 hour) if omitted.
    pub ttl_secs: Option<u64>,
}

#[derive(Serialize)]
pub struct ClientTokenResponseDto {
    pub token: String,
}
