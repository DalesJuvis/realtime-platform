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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use serde::Deserialize;
    use serde_json::json;
    use std::sync::Arc;
    use tower::ServiceExt; // for `Router::oneshot`
    use uuid::Uuid;

    use crate::modules::auth::services::TokenService::TokenService;

    #[derive(Deserialize)]
    struct Envelope<T> {
        success: bool,
        data: T,
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        token: String,
        expires_in: u64,
        ws_url: String,
    }

    #[tokio::test]
    async fn mint_token_derives_wss_url_from_the_requests_own_headers() {
        let auth = Arc::new(TokenService::new());
        let tenant_id = Uuid::new_v4();
        auth.register_tenant(tenant_id, b"real-secret".to_vec());
        let app = router(AuthApiContext { token_service: auth, public_ws_url: None });

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/tokens")
                    .header("content-type", "application/json")
                    .header("host", "mio.example.com")
                    .header("x-forwarded-proto", "https")
                    .body(Body::from(
                        json!({ "tenant_id": tenant_id, "secret": "real-secret", "sub": "user-42" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<TokenResponse> = serde_json::from_slice(&body).unwrap();
        assert!(parsed.success);
        assert!(!parsed.data.token.is_empty());
        assert_eq!(parsed.data.expires_in, 3600);
        assert_eq!(parsed.data.ws_url, "wss://mio.example.com/ws");
    }

    #[tokio::test]
    async fn mint_token_derives_plain_ws_without_a_forwarded_https_proto() {
        let auth = Arc::new(TokenService::new());
        let tenant_id = Uuid::new_v4();
        auth.register_tenant(tenant_id, b"real-secret".to_vec());
        let app = router(AuthApiContext { token_service: auth, public_ws_url: None });

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/tokens")
                    .header("content-type", "application/json")
                    .header("host", "localhost:8090")
                    .body(Body::from(
                        json!({ "tenant_id": tenant_id, "secret": "real-secret", "sub": "user-42" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<TokenResponse> = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed.data.ws_url, "ws://localhost:8090/ws");
    }

    #[tokio::test]
    async fn configured_public_ws_url_overrides_header_derivation() {
        let auth = Arc::new(TokenService::new());
        let tenant_id = Uuid::new_v4();
        auth.register_tenant(tenant_id, b"real-secret".to_vec());
        let app = router(AuthApiContext {
            token_service: auth,
            public_ws_url: Some(Arc::from("ws://localhost:8080/ws")),
        });

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/tokens")
                    .header("content-type", "application/json")
                    .header("host", "mio.example.com")
                    .header("x-forwarded-proto", "https")
                    .body(Body::from(
                        json!({ "tenant_id": tenant_id, "secret": "real-secret", "sub": "user-42" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<TokenResponse> = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed.data.ws_url, "ws://localhost:8080/ws");
    }

    #[tokio::test]
    async fn rejects_wrong_secret_without_ever_exposing_a_ws_url() {
        let auth = Arc::new(TokenService::new());
        let tenant_id = Uuid::new_v4();
        auth.register_tenant(tenant_id, b"real-secret".to_vec());
        let app = router(AuthApiContext { token_service: auth, public_ws_url: None });

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/tokens")
                    .header("content-type", "application/json")
                    .header("host", "mio.example.com")
                    .body(Body::from(
                        json!({ "tenant_id": tenant_id, "secret": "wrong-secret", "sub": "user-42" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }
}
