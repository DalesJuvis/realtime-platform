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
}
