//! # AuthApiContext
//!
//! **Action:** Dependency-injection context for the public token-issuance
//! endpoint (`POST /api/v1/auth/tokens`) — the smallest possible surface,
//! a single `TokenService` reference.

use std::sync::Arc;

use crate::modules::auth::services::TokenService::TokenService;

#[derive(Clone)]
pub struct AuthApiContext {
    pub token_service: Arc<TokenService>,
    /// `Settings::public_ws_url` — see `services::WsUrlService`'s doc
    /// comment for why this is `None` in every documented production
    /// topology and only needed for local dev's split-port setup.
    pub public_ws_url: Option<Arc<str>>,
}
