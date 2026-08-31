//! # IssueTokenDto
//!
//! **Action:** Request/response bodies for `POST /api/v1/auth/tokens` —
//! the HTTP handshake a tenant's own backend performs, server-to-server,
//! before handing a client (WS/TCP) token to one of its own end users.
//! Never called from a browser directly: `secret` must stay server-side.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct IssueTokenDto {
    pub tenant_id: Uuid,
    pub secret: String,
    /// The end user this token is for — becomes the `sub` claim, and the
    /// UNICAST inbox address (`unicast_inbox_channel`) once connected.
    pub sub: String,
    /// Defaults to 3600 (1 hour) if omitted.
    pub ttl_secs: Option<u64>,
}

#[derive(Serialize)]
pub struct TokenResponseDto {
    pub token: String,
    pub expires_in: u64,
    /// The `ws://`/`wss://.../ws` URL to actually connect to — derived
    /// server-side (`services::WsUrlService::derive_ws_url`) from the
    /// very request that minted this token, so no SDK ever needs a
    /// host/port/secure config of its own. Hand this straight to your
    /// SDK's connect call alongside `token`.
    pub ws_url: String,
}
