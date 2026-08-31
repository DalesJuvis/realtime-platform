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
    /// The TTL actually applied (the request's `ttl_secs`, or the 3600s
    /// default — see `MintClientTokenUseCase`) — returned so a caller
    /// never has to duplicate that default to know when its own token
    /// expires (e.g. `tenant-portal`'s downloadable credentials file).
    pub expires_in: u64,
    /// The `ws://`/`wss://.../ws` URL to actually connect to — see
    /// `IssueTokenDto::TokenResponseDto::ws_url`'s doc comment, same
    /// derivation, same reasoning.
    pub ws_url: String,
}
