//! # routes (auth)
//!
//! **Action:** Registers the public token-issuance route under `/api/v1/auth/*`.
//! **Input:** `AuthApiContext`.
//! **Output:** An `axum::Router`, merged onto the Portal API's router in
//! `main.rs` (same bind address — this is meant to be reachable by a
//! tenant's own backend over the internet, same as the Portal API).
//!
//! ## Security
//! Unauthenticated at the HTTP-guard level (no bearer token) — the
//! authentication *is* the request body: nothing is returned unless the
//! caller proves it holds the tenant's real secret
//! (`TokenService::verify_tenant_secret`). Never call this from a
//! browser: `secret` must stay on a server the tenant controls.

use axum::http::Method;
use axum::routing::post;
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::modules::auth::controllers::IssueClientTokenController;
use crate::modules::auth::AuthApiContext::AuthApiContext;

pub fn router(ctx: AuthApiContext) -> Router {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods([Method::POST]).allow_headers(Any);

    Router::new()
        .nest(
            "/api/v1/auth",
            Router::new().route("/tokens", post(IssueClientTokenController::handle)).with_state(ctx),
        )
        .layer(cors)
}
