//! # routes
//!
//! **Action:** Registers every Admin API route under the URL structure
//! `/api/v{version}/{segment}/{domain}/{action?}` (BACKEND.md §6), applying
//! the `admin` segment's middleware stack only to the routes that need it.
//! **Input:** `AdminContext`.
//! **Output:** An `axum::Router` ready to be served on the Admin port.
//! **Side effects:** None.
//! **Dependencies:** All admin controllers, `middleware::AdminTokenGuard`, `metrics::controllers::GetMetricsController`.
//!
//! ## Segments
//! - `admin` (`/api/v1/admin/*`) — tenant management, guarded by
//!   `AdminTokenGuard` (`Authorization: Bearer <ADMIN_API_TOKEN>`).
//! - `system` (`/api/v1/system/*`) — health probe and Prometheus scraping,
//!   deliberately unauthenticated (standard for this kind of endpoint —
//!   protection comes from the Admin port never being exposed publicly).
//!
//! ## Security
//! This whole router is served on a **dedicated port** (`ADMIN_BIND_ADDR`)
//! that must **never** be exposed publicly — reserve it for an internal
//! network, a VPN, or an mTLS sidecar depending on deployment environment.
//! Tenant secrets are generated server-side by default (32 cryptographically
//! random bytes) and returned in clear only once, in the create/rotate
//! response — like a password, never stored or re-logged in clear.

use axum::http::Method;
use axum::middleware;
use axum::routing::{delete, get, post, put};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::modules::admin::controllers::{
    CreateTenantController, HealthzController, ListTenantSessionsController, MintTenantTokenController,
    RevokeTenantController, RotateTenantSecretController, SetTenantLimitsController,
};
use crate::modules::admin::middleware::AdminTokenGuard;
use crate::modules::admin::AdminContext::AdminContext;
use crate::modules::metrics::controllers::GetMetricsController;

fn admin_segment_routes(ctx: AdminContext) -> Router {
    Router::new()
        .route("/tenants", post(CreateTenantController::handle))
        .route("/tenants/:id", delete(RevokeTenantController::handle))
        .route("/tenants/:id/secret", put(RotateTenantSecretController::handle))
        .route("/tenants/:id/limits", put(SetTenantLimitsController::handle))
        .route("/tenants/:id/sessions", get(ListTenantSessionsController::handle))
        .route("/tenants/:id/tokens", post(MintTenantTokenController::handle))
        .route_layer(middleware::from_fn_with_state(ctx.clone(), AdminTokenGuard::require_admin_token))
        .with_state(ctx)
}

fn system_segment_routes(ctx: AdminContext) -> Router {
    Router::new()
        .route("/health", get(HealthzController::handle))
        .route("/metrics", get(GetMetricsController::handle))
        .with_state(ctx)
}

pub fn router(ctx: AdminContext) -> Router {
    // Permissive by origin: the security boundary for this API is already
    // network-level (§ "never expose publicly" above), not CORS — an
    // admin-panel SPA (e.g. `admin/`) is a legitimate first-party browser
    // client and there's no fixed origin to allow-list (arbitrary
    // localhost dev ports, or whatever host the operator deploys it to).
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    Router::new()
        .nest("/api/v1/admin", admin_segment_routes(ctx.clone()))
        .nest("/api/v1/system", system_segment_routes(ctx))
        .layer(cors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use serde::Deserialize;
    use tower::ServiceExt; // for `Router::oneshot`

    use crate::modules::auth::services::TokenService::TokenService;
    use crate::modules::metrics::services::MetricsService::MetricsService;
    use crate::modules::rate_limit::services::RateLimitService::RateLimitService;
    use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;
    use crate::modules::realtime::services::PresenceService::PresenceService;
    use crate::entities::RateLimitConfig::RateLimitConfig;
    use std::sync::Arc;

    fn test_ctx() -> AdminContext {
        let channel_router = Arc::new(ChannelRouterService::new());
        AdminContext {
            auth: Arc::new(TokenService::new()),
            rate_limiter: Arc::new(RateLimitService::new(RateLimitConfig::default())),
            admin_token: Arc::new("test-admin-token".to_string()),
            metrics: MetricsService::new(),
            presence: PresenceService::new(std::time::Duration::from_secs(30), channel_router),
        }
    }

    #[derive(Deserialize)]
    struct Envelope<T> {
        success: bool,
        data: T,
    }

    #[derive(Deserialize)]
    struct TenantSecretResponse {
        tenant_id: uuid::Uuid,
        secret: String,
    }

    #[tokio::test]
    async fn rejects_missing_bearer_token() {
        let app = router(test_ctx());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/tenants")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn creates_tenant_with_generated_secret() {
        let ctx = test_ctx();
        let auth = ctx.auth.clone();
        let app = router(ctx);

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/tenants")
                    .header("content-type", "application/json")
                    .header("authorization", "Bearer test-admin-token")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<TenantSecretResponse> = serde_json::from_slice(&body).unwrap();
        assert!(parsed.success);
        assert!(!parsed.data.secret.is_empty());

        // The created tenant must now be able to issue a valid token.
        assert!(auth.issue_token(parsed.data.tenant_id, "user-1", 60).is_ok());
    }

    #[tokio::test]
    async fn mints_a_tenant_token_and_lists_its_session() {
        let ctx = test_ctx();
        let auth = ctx.auth.clone();
        let presence = ctx.presence.clone();
        let app = router(ctx);

        let tenant_id = uuid::Uuid::new_v4();
        auth.register_tenant(tenant_id, b"sandbox-secret".to_vec());

        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/admin/tenants/{tenant_id}/tokens"))
                    .header("content-type", "application/json")
                    .header("authorization", "Bearer test-admin-token")
                    .body(Body::from(serde_json::json!({ "sub": "agent-1" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        #[derive(Deserialize)]
        struct TokenResponse {
            token: String,
        }
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<TokenResponse> = serde_json::from_slice(&body).unwrap();
        assert!(auth.validate(tenant_id, &parsed.data.token).is_ok());

        // Simulate that token being used to open a live session (what
        // `WsController`/`AuthenticateSessionUseCase` would do on connect).
        presence.handle_join(tenant_id, uuid::Uuid::new_v4(), "agent-1".to_string());

        let resp = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/v1/admin/tenants/{tenant_id}/sessions"))
                    .header("authorization", "Bearer test-admin-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        #[derive(Deserialize)]
        struct Session {
            sub: String,
        }
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<Vec<Session>> = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed.data.len(), 1);
        assert_eq!(parsed.data[0].sub, "agent-1");
    }

    #[tokio::test]
    async fn health_endpoint_requires_no_auth() {
        let app = router(test_ctx());
        let resp = app
            .oneshot(Request::builder().uri("/api/v1/system/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }
}
