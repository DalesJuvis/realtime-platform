//! # MintTokenDto
//!
//! **Action:** Request/response bodies for `POST /api/v1/admin/tenants/:id/tokens`
//! — mints a client (WS/TCP) token for an arbitrary `sub` on a given
//! tenant, for the Sandbox page's "join a session" flow. Unlike the public
//! `POST /api/v1/auth/tokens`, no tenant secret is required here: the
//! caller is already authenticated as the platform admin
//! (`AdminTokenGuard`), which is a stronger proof of authority than
//! knowing one tenant's secret.

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct AdminMintTokenDto {
    pub sub: String,
    /// Defaults to 3600 (1 hour) if omitted.
    pub ttl_secs: Option<u64>,
}

#[derive(Serialize)]
pub struct ClientTokenResponseDto {
    pub token: String,
}
