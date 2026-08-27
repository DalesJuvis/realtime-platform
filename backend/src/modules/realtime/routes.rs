//! # routes (realtime HTTP surface)
//!
//! **Action:** Registers the HTTP publish route under `/api/v1/messages`.
//! **Input:** `RealtimeContext` (reused as-is — this is the same publish
//! pipeline as WS/TCP, just a different entry point, so no separate
//! context struct).
//! **Output:** An `axum::Router`, merged onto the Portal API's router in
//! `main.rs` — same public, tenant-backend-reachable listener as
//! `/api/v1/auth/tokens`, since minting a token and then publishing with
//! it is the natural two-step flow for a caller with no persistent socket.
//!
//! ## Security
//! Guarded by a bearer client token (`Authorization` header), validated
//! against the request body's `tenant_id` via `TokenService::validate` —
//! never a raw tenant secret. See `PublishMessageHttpController`.

use axum::http::Method;
use axum::routing::post;
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::modules::realtime::controllers::PublishMessageHttpController;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

pub fn router(ctx: RealtimeContext) -> Router {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods([Method::POST]).allow_headers(Any);

    Router::new()
        .route("/api/v1/messages", post(PublishMessageHttpController::handle))
        .with_state(ctx)
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

    use crate::entities::ChannelKey::ChannelKey;
    use crate::entities::RateLimitConfig::RateLimitConfig;
    use crate::modules::auth::services::TokenService::TokenService;
    use crate::modules::metrics::services::MetricsService::MetricsService;
    use crate::modules::push::adapters::FcmPushAdapter::{FcmConfig, FcmPushAdapter};
    use crate::modules::push::ports::PushPort::PushPort;
    use crate::modules::rate_limit::services::RateLimitService::RateLimitService;
    use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;
    use crate::modules::realtime::services::PresenceService::PresenceService;
    use crate::modules::realtime::services::PushFallbackService::PushFallbackService;

    fn test_ctx() -> (RealtimeContext, Arc<TokenService>, Arc<ChannelRouterService>, Arc<RateLimitService>) {
        let auth = Arc::new(TokenService::new());
        let channel_router = Arc::new(ChannelRouterService::new());
        let presence = PresenceService::new(std::time::Duration::from_secs(30), channel_router.clone());
        let rate_limiter = Arc::new(RateLimitService::new(RateLimitConfig::default()));
        let metrics = MetricsService::new();
        // `target_tokens` is always empty for this DTO path (see
        // `PushFallbackService::publish_and_fanout`), so `submit()` drops
        // silently — no real network call happens in these tests.
        let push: Arc<dyn PushPort> = FcmPushAdapter::spawn(FcmConfig {
            project_id: "test".to_string(),
            bearer_token: "test".to_string(),
        });
        let push_fallback = PushFallbackService::new(channel_router.clone(), push, None, metrics.clone());

        let ctx = RealtimeContext {
            auth: auth.clone(),
            channel_router: channel_router.clone(),
            presence,
            push_fallback,
            rate_limiter: rate_limiter.clone(),
            metrics,
        };
        (ctx, auth, channel_router, rate_limiter)
    }

    #[derive(Deserialize)]
    struct Envelope<T> {
        success: bool,
        #[serde(default)]
        data: Option<T>,
        #[serde(default)]
        error: Option<ErrorBody>,
    }

    #[derive(Deserialize)]
    struct ErrorBody {
        code: String,
    }

    #[derive(Deserialize, Default)]
    struct PublishedBody {
        published: bool,
    }

    async fn post(app: Router, auth_header: Option<&str>, body: serde_json::Value) -> axum::response::Response {
        let mut req = Request::builder()
            .method("POST")
            .uri("/api/v1/messages")
            .header("content-type", "application/json");
        if let Some(h) = auth_header {
            req = req.header("authorization", h);
        }
        app.oneshot(req.body(Body::from(body.to_string())).unwrap()).await.unwrap()
    }

    #[tokio::test]
    async fn rejects_missing_bearer_token() {
        let (ctx, ..) = test_ctx();
        let resp = post(router(ctx), None, json!({ "tenant_id": Uuid::new_v4(), "channel_id": "room-1", "payload": "hi" })).await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn publishes_and_reaches_a_local_subscriber() {
        let (ctx, auth, channel_router, _) = test_ctx();
        let tenant = Uuid::new_v4();
        auth.register_tenant(tenant, b"secret".to_vec());
        let token = auth.issue_token(tenant, "user-1", 60).unwrap();

        let key = ChannelKey::new(tenant, "room-1");
        let mut rx = channel_router.subscribe(tenant, &key).unwrap();

        let resp = post(
            router(ctx),
            Some(&format!("Bearer {token}")),
            json!({ "tenant_id": tenant, "channel_id": "room-1", "payload": "hello via http" }),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<PublishedBody> = serde_json::from_slice(&body).unwrap();
        assert!(parsed.success);
        assert!(parsed.data.unwrap().published);

        let raw = rx.try_recv().expect("subscriber should have received the HTTP-published frame");
        let frame = crate::entities::Frame::Frame::parse(&raw).unwrap();
        assert_eq!(frame.payload(), "hello via http");
    }

    #[tokio::test]
    async fn rejects_token_for_a_different_tenant() {
        let (ctx, auth, ..) = test_ctx();
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();
        auth.register_tenant(tenant_a, b"secret-a".to_vec());
        auth.register_tenant(tenant_b, b"secret-b".to_vec());
        let token_for_a = auth.issue_token(tenant_a, "user-1", 60).unwrap();

        let resp = post(
            router(ctx),
            Some(&format!("Bearer {token_for_a}")),
            json!({ "tenant_id": tenant_b, "channel_id": "room-1", "payload": "hi" }),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_oversized_payload() {
        let (ctx, auth, ..) = test_ctx();
        let tenant = Uuid::new_v4();
        auth.register_tenant(tenant, b"secret".to_vec());
        let token = auth.issue_token(tenant, "user-1", 60).unwrap();

        let resp = post(
            router(ctx),
            Some(&format!("Bearer {token}")),
            json!({ "tenant_id": tenant, "channel_id": "room-1", "payload": "x".repeat(212) }),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<PublishedBody> = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed.error.unwrap().code, "INVALID_REQUEST");
    }

    #[tokio::test]
    async fn rejects_when_tenant_rate_limit_is_exhausted() {
        let (ctx, auth, _, rate_limiter) = test_ctx();
        let tenant = Uuid::new_v4();
        auth.register_tenant(tenant, b"secret".to_vec());
        let token = auth.issue_token(tenant, "user-1", 60).unwrap();
        rate_limiter.set_tenant_limits(
            tenant,
            RateLimitConfig {
                session_capacity: 100,
                session_refill_per_sec: 100,
                tenant_capacity: 1,
                tenant_refill_per_sec: 0,
            },
        );

        let app = router(ctx);
        let body = json!({ "tenant_id": tenant, "channel_id": "room-1", "payload": "hi" });
        let first = post(app.clone(), Some(&format!("Bearer {token}")), body.clone()).await;
        assert_eq!(first.status(), StatusCode::OK);

        let second = post(app, Some(&format!("Bearer {token}")), body).await;
        assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
    }
}
