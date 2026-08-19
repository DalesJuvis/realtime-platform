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

use axum::middleware;
use axum::routing::{delete, get, post, put};
use axum::Router;

use crate::modules::admin::controllers::{
    CreateTenantController, HealthzController, RevokeTenantController,
    RotateTenantSecretController, SetTenantLimitsController,
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
    Router::new()
        .nest("/api/v1/admin", admin_segment_routes(ctx.clone()))
        .nest("/api/v1/system", system_segment_routes(ctx))
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
    use crate::entities::RateLimitConfig::RateLimitConfig;
    use std::sync::Arc;

    fn test_ctx() -> AdminContext {
        AdminContext {
            auth: Arc::new(TokenService::new()),
            rate_limiter: Arc::new(RateLimitService::new(RateLimitConfig::default())),
            admin_token: Arc::new("test-admin-token".to_string()),
            metrics: MetricsService::new(),
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
    async fn health_endpoint_requires_no_auth() {
        let app = router(test_ctx());
        let resp = app
            .oneshot(Request::builder().uri("/api/v1/system/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }
}
