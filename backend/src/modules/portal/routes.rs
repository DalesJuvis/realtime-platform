//! # routes (portal)
//!
//! **Action:** Registers every Portal API route under `/api/v1/portal/*`.
//! **Input:** `PortalContext`.
//! **Output:** An `axum::Router` ready to be served on the Portal port.
//! **Side effects:** None.
//! **Dependencies:** All portal controllers, `middleware::PortalSessionGuard`.
//!
//! ## Segments
//! - `auth` (`/api/v1/portal/auth/*`) — register/login, public (a session
//!   token doesn't exist yet to guard with).
//! - everything else (`/api/v1/portal/*`) — guarded by `PortalSessionGuard`,
//!   every usecase scoped to the token's own `tenant_id`, never a
//!   caller-supplied one (unlike the Admin API's `:id` path params).
//!
//! ## Security
//! Meant to be reachable by tenants' own browsers, unlike the Admin API —
//! CORS is permissive here for the same reason (see `admin::routes`'s doc
//! comment), but the actual data boundary is per-token `tenant_id`
//! scoping, enforced in every usecase, not network placement.

use axum::extract::DefaultBodyLimit;
use axum::http::Method;
use axum::middleware;
use axum::routing::{delete, get, post, put};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::modules::portal::controllers::{
    BroadcastController, ChangePasswordController, CreateTemplateController, DeleteTemplateController,
    GenerateApiKeyController, GetKeysController, GetOverviewController, GetProfileController,
    ListApiKeysController, ListChannelsController, ListSessionsController, ListTemplatesController, LoginController,
    MintTokenController, RegisterController, RevokeApiKeyController, RotateSecretController, SignupController,
    UpdateProfileController, UpdateTemplateController, UploadLogoController,
};
use crate::modules::portal::middleware::PortalSessionGuard;
use crate::modules::portal::PortalContext::PortalContext;

fn auth_segment_routes(ctx: PortalContext) -> Router {
    Router::new()
        .route("/signup", post(SignupController::handle))
        .route("/register", post(RegisterController::handle))
        .route("/login", post(LoginController::handle))
        .with_state(ctx)
}

fn protected_segment_routes(ctx: PortalContext) -> Router {
    Router::new()
        .route("/sessions", get(ListSessionsController::handle))
        .route("/tokens", post(MintTokenController::handle))
        .route("/overview", get(GetOverviewController::handle))
        .route("/keys", get(GetKeysController::handle))
        .route("/keys/rotate", post(RotateSecretController::handle))
        .route("/api-keys", get(ListApiKeysController::handle).post(GenerateApiKeyController::handle))
        .route("/api-keys/:id", delete(RevokeApiKeyController::handle))
        .route("/channels", get(ListChannelsController::handle))
        .route("/broadcast", post(BroadcastController::handle))
        .route("/templates", get(ListTemplatesController::handle).post(CreateTemplateController::handle))
        .route(
            "/templates/:id",
            put(UpdateTemplateController::handle).delete(DeleteTemplateController::handle),
        )
        .route("/profile", get(GetProfileController::handle).put(UpdateProfileController::handle))
        .route(
            "/profile/logo",
            // axum's own default body-size limit (2 MB) is stricter, in
            // decoded-byte terms, than `UploadLogoUseCase`'s 2 MB check —
            // base64 inflates size by ~33%, so a base64-encoded image at
            // the intended 2 MB limit needs a ~2.7 MB raw request body.
            // Raised here so that check (not axum's incidental default) is
            // what actually enforces the limit.
            put(UploadLogoController::handle).layer(DefaultBodyLimit::max(4 * 1024 * 1024)),
        )
        .route("/account/password", put(ChangePasswordController::handle))
        .route_layer(middleware::from_fn_with_state(ctx.clone(), PortalSessionGuard::require_portal_session))
        .with_state(ctx)
}

pub fn router(ctx: PortalContext) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    Router::new()
        .nest("/api/v1/portal/auth", auth_segment_routes(ctx.clone()))
        .nest("/api/v1/portal", protected_segment_routes(ctx))
        .layer(cors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use serde::Deserialize;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::sync::Arc;
    use tower::ServiceExt; // for `Router::oneshot`

    use crate::entities::ChannelKey::ChannelKey;
    use crate::modules::auth::services::TokenService::TokenService;
    use crate::modules::metrics::services::MetricsService::MetricsService;
    use crate::modules::portal::repositories::ApiKeyRepository::ApiKeyRepository;
    use crate::modules::portal::repositories::MessageTemplateRepository::MessageTemplateRepository;
    use crate::modules::portal::repositories::TenantSecretStoreRepository::TenantSecretStoreRepository;
    use crate::modules::portal::repositories::TenantUserRepository::TenantUserRepository;
    use crate::modules::portal::repositories::WorkspaceProfileRepository::WorkspaceProfileRepository;
    use crate::modules::portal::services::PortalAuthService::PortalAuthService;
    use crate::modules::push::adapters::FcmPushAdapter::{FcmConfig, FcmPushAdapter};
    use crate::modules::push::ports::PushPort::PushPort;
    use crate::modules::rate_limit::services::RateLimitService::RateLimitService;
    use crate::modules::realtime::repositories::PushSubscriptionRepository::PushSubscriptionRepository;
    use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;
    use crate::modules::realtime::services::PresenceService::PresenceService;
    use crate::modules::realtime::services::PushFallbackService::PushFallbackService;

    async fn test_ctx() -> (PortalContext, Arc<ChannelRouterService>) {
        // A single-connection in-memory pool: `:memory:` gives each new
        // connection its own separate database, so a pool that could open
        // more than one connection would see inconsistent state across
        // requests in the same test.
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let channel_router = Arc::new(ChannelRouterService::new());
        let presence = PresenceService::new(std::time::Duration::from_secs(30), channel_router.clone());
        let metrics = MetricsService::new();
        let push: Arc<dyn PushPort> = FcmPushAdapter::spawn(FcmConfig {
            project_id: "test".to_string(),
            bearer_token: "test".to_string(),
        });
        let push_subscriptions = Arc::new(PushSubscriptionRepository::new(pool.clone()));
        let push_fallback =
            PushFallbackService::new(channel_router.clone(), push, None, push_subscriptions, None, metrics.clone());

        let ctx = PortalContext {
            token_service: Arc::new(TokenService::new()),
            presence,
            metrics,
            portal_auth: Arc::new(PortalAuthService::new(b"test-session-secret".to_vec())),
            tenant_users: Arc::new(TenantUserRepository::new(pool.clone())),
            tenant_secrets: Arc::new(TenantSecretStoreRepository::new(pool.clone())),
            api_keys: Arc::new(ApiKeyRepository::new(pool.clone())),
            templates: Arc::new(MessageTemplateRepository::new(pool.clone())),
            workspace_profile: Arc::new(WorkspaceProfileRepository::new(pool)),
            channel_router: channel_router.clone(),
            push_fallback,
            rate_limiter: Arc::new(RateLimitService::new(Default::default())),
        };
        (ctx, channel_router)
    }

    #[derive(Deserialize)]
    struct Envelope<T> {
        success: bool,
        #[serde(default)]
        data: Option<T>,
    }

    #[derive(Deserialize, Default)]
    struct Keys {
        tenant_id: uuid::Uuid,
        secret_key: String,
    }

    #[derive(Deserialize, Default)]
    struct SignupData {
        access_token: String,
        keys: Keys,
    }

    async fn body_json<T: serde::de::DeserializeOwned + Default>(resp: axum::response::Response) -> T {
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<T> = serde_json::from_slice(&bytes).unwrap();
        assert!(parsed.success);
        parsed.data.unwrap_or_default()
    }

    async fn signup(app: &Router, email: &str) -> SignupData {
        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/portal/auth/signup")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({ "email": email, "password": "correct horse battery staple" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        body_json(resp).await
    }

    fn authed(method: &str, uri: &str, token: &str, body: serde_json::Value) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    #[tokio::test]
    async fn signup_creates_a_working_session_and_key_pair() {
        let (ctx, _) = test_ctx().await;
        let auth = ctx.token_service.clone();
        let app = router(ctx);

        let signup_data = signup(&app, "founder@example.com").await;
        assert!(!signup_data.access_token.is_empty());
        assert!(!signup_data.keys.secret_key.is_empty());
        // The freshly generated secret must actually validate a token for
        // this tenant — proof the signup key pair is real, not cosmetic.
        assert!(auth.issue_token(signup_data.keys.tenant_id, "user-1", 60).is_ok());

        let resp = app
            .clone()
            .oneshot(authed("GET", "/api/v1/portal/keys", &signup_data.access_token, json!({})))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let keys: Keys = body_json(resp).await;
        assert_eq!(keys.secret_key, signup_data.keys.secret_key);
    }

    #[tokio::test]
    async fn rotating_the_secret_changes_it() {
        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        let signup_data = signup(&app, "rotate@example.com").await;

        let resp = app
            .clone()
            .oneshot(authed("POST", "/api/v1/portal/keys/rotate", &signup_data.access_token, json!({})))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let rotated: Keys = body_json(resp).await;
        assert_ne!(rotated.secret_key, signup_data.keys.secret_key);

        let resp = app
            .oneshot(authed("GET", "/api/v1/portal/keys", &signup_data.access_token, json!({})))
            .await
            .unwrap();
        let keys: Keys = body_json(resp).await;
        assert_eq!(keys.secret_key, rotated.secret_key);
    }

    #[tokio::test]
    async fn broadcast_reaches_a_subscriber_and_shows_up_in_channel_list() {
        let (ctx, channel_router) = test_ctx().await;
        let app = router(ctx);
        let signup_data = signup(&app, "broadcaster@example.com").await;
        let tenant_id = signup_data.keys.tenant_id;

        let key = ChannelKey::new(tenant_id, "announcements");
        let mut rx = channel_router.subscribe(tenant_id, &key).unwrap();

        let resp = app
            .clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/broadcast",
                &signup_data.access_token,
                json!({ "channel_id": "announcements", "payload": "v2 is live" }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let raw = rx.try_recv().expect("subscriber should receive the broadcast frame");
        let frame = crate::entities::Frame::Frame::parse(&raw).unwrap();
        assert_eq!(frame.payload(), "v2 is live");

        let resp = app
            .oneshot(authed("GET", "/api/v1/portal/channels", &signup_data.access_token, json!({})))
            .await
            .unwrap();
        #[derive(Deserialize)]
        struct Channel {
            channel_id: String,
            subscriber_count: usize,
        }
        let channels: Vec<Channel> = body_json(resp).await;
        let announcements = channels.iter().find(|c| c.channel_id == "announcements").unwrap();
        assert_eq!(announcements.subscriber_count, 1);
    }

    #[tokio::test]
    async fn templates_crud_roundtrip() {
        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        let signup_data = signup(&app, "templater@example.com").await;

        #[derive(Deserialize, Default)]
        struct Template {
            id: uuid::Uuid,
            name: String,
            #[serde(default)]
            #[allow(dead_code)]
            body: String,
        }

        let resp = app
            .clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/templates",
                &signup_data.access_token,
                json!({ "name": "Welcome", "body": "Hi {{name}}, welcome aboard!" }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let created: Template = body_json(resp).await;
        assert_eq!(created.name, "Welcome");

        let resp = app
            .clone()
            .oneshot(authed("GET", "/api/v1/portal/templates", &signup_data.access_token, json!({})))
            .await
            .unwrap();
        let listed: Vec<Template> = body_json(resp).await;
        assert_eq!(listed.len(), 1);

        let resp = app
            .clone()
            .oneshot(authed(
                "PUT",
                &format!("/api/v1/portal/templates/{}", created.id),
                &signup_data.access_token,
                json!({ "name": "Welcome v2", "body": "Hey {{name}}!" }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let resp = app
            .clone()
            .oneshot(authed(
                "DELETE",
                &format!("/api/v1/portal/templates/{}", created.id),
                &signup_data.access_token,
                json!({}),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let resp = app
            .oneshot(authed("GET", "/api/v1/portal/templates", &signup_data.access_token, json!({})))
            .await
            .unwrap();
        let listed: Vec<Template> = body_json(resp).await;
        assert!(listed.is_empty());
    }

    #[tokio::test]
    async fn signup_rejects_a_duplicate_email() {
        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        signup(&app, "dup@example.com").await;

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/portal/auth/signup")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({ "email": "dup@example.com", "password": "whatever12345" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn profile_update_roundtrip() {
        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        let signup_data = signup(&app, "profile@example.com").await;

        #[derive(Deserialize, Default)]
        struct Profile {
            name: Option<String>,
            website_url: Option<String>,
        }

        let resp = app
            .clone()
            .oneshot(authed("GET", "/api/v1/portal/profile", &signup_data.access_token, json!({})))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let empty: Profile = body_json(resp).await;
        assert!(empty.name.is_none());

        let resp = app
            .clone()
            .oneshot(authed(
                "PUT",
                "/api/v1/portal/profile",
                &signup_data.access_token,
                json!({ "name": "Acme Workspace", "website_url": null }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let updated: Profile = body_json(resp).await;
        assert_eq!(updated.name.as_deref(), Some("Acme Workspace"));

        // Omitting website_url must leave the name untouched (partial update).
        let resp = app
            .oneshot(authed(
                "PUT",
                "/api/v1/portal/profile",
                &signup_data.access_token,
                json!({ "name": null, "website_url": "https://acme.example" }),
            ))
            .await
            .unwrap();
        let updated: Profile = body_json(resp).await;
        assert_eq!(updated.name.as_deref(), Some("Acme Workspace"));
        assert_eq!(updated.website_url.as_deref(), Some("https://acme.example"));
    }

    #[tokio::test]
    async fn logo_upload_rejects_bad_mime_and_oversize_then_accepts_valid() {
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        let signup_data = signup(&app, "logo@example.com").await;

        // Disallowed MIME type.
        let resp = app
            .clone()
            .oneshot(authed(
                "PUT",
                "/api/v1/portal/profile/logo",
                &signup_data.access_token,
                json!({ "data_uri": "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

        // Oversized payload (> 2 MB decoded, but comfortably under the
        // route's raised raw body-size limit — this must be rejected by
        // `UploadLogoUseCase`'s own check, not axum's incidental one).
        let oversized = STANDARD.encode(vec![0u8; (2.5 * 1024.0 * 1024.0) as usize]);
        let resp = app
            .clone()
            .oneshot(authed(
                "PUT",
                "/api/v1/portal/profile/logo",
                &signup_data.access_token,
                json!({ "data_uri": format!("data:image/png;base64,{oversized}") }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

        // A tiny valid 1x1 PNG must be accepted.
        let tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        let resp = app
            .oneshot(authed(
                "PUT",
                "/api/v1/portal/profile/logo",
                &signup_data.access_token,
                json!({ "data_uri": tiny_png }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        #[derive(Deserialize, Default)]
        struct Profile {
            #[allow(dead_code)]
            name: Option<String>,
            logo_data_uri: Option<String>,
        }
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: Envelope<Profile> = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed.data.unwrap_or_default().logo_data_uri.as_deref(), Some(tiny_png));
    }

    #[tokio::test]
    async fn change_password_then_old_password_no_longer_logs_in() {
        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        signup(&app, "pwchange@example.com").await;

        let login = |password: &'static str| {
            let app = app.clone();
            async move {
                app.oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/portal/auth/login")
                        .header("content-type", "application/json")
                        .body(Body::from(json!({ "email": "pwchange@example.com", "password": password }).to_string()))
                        .unwrap(),
                )
                .await
                .unwrap()
            }
        };

        #[derive(Deserialize, Default)]
        struct LoginData {
            access_token: String,
        }

        let resp = login("correct horse battery staple").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let session: LoginData = body_json(resp).await;

        let resp = app
            .clone()
            .oneshot(authed(
                "PUT",
                "/api/v1/portal/account/password",
                &session.access_token,
                json!({ "current_password": "correct horse battery staple", "new_password": "new-strong-password" }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let resp = login("correct horse battery staple").await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

        let resp = login("new-strong-password").await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[derive(Deserialize, Default)]
    struct GeneratedKey {
        id: uuid::Uuid,
        public_key: String,
        secret: String,
    }

    #[derive(Deserialize, Default)]
    struct ListedKey {
        id: uuid::Uuid,
        public_key: String,
        status: String,
    }

    #[tokio::test]
    async fn generated_api_key_mints_a_working_token_alongside_the_primary_secret() {
        let (ctx, _) = test_ctx().await;
        let auth = ctx.token_service.clone();
        let app = router(ctx);
        let signup_data = signup(&app, "extra-key@example.com").await;

        let resp = app
            .clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/api-keys",
                &signup_data.access_token,
                json!({ "name": "Production server" }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let generated: GeneratedKey = body_json(resp).await;

        assert!(!generated.public_key.is_empty());
        assert_ne!(generated.public_key, signup_data.keys.tenant_id.to_string());
        assert_ne!(generated.secret, signup_data.keys.secret_key);

        // The new key must actually be live in the request-hot-path store,
        // not just persisted — same proof pattern as the primary secret's
        // own signup test.
        assert!(auth.verify_tenant_secret(signup_data.keys.tenant_id, generated.secret.as_bytes()));
        let token = auth
            .issue_token_with_secret(signup_data.keys.tenant_id, "user-1", 60, generated.secret.as_bytes())
            .unwrap();
        assert!(auth.validate(signup_data.keys.tenant_id, &token).is_ok());

        // The primary secret must still work untouched.
        assert!(auth.issue_token(signup_data.keys.tenant_id, "user-2", 60).is_ok());
    }

    #[tokio::test]
    async fn list_api_keys_shows_generated_pairs_scoped_to_the_caller() {
        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        let signup_a = signup(&app, "list-a@example.com").await;
        let signup_b = signup(&app, "list-b@example.com").await;

        app.clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/api-keys",
                &signup_a.access_token,
                json!({ "name": "A's key" }),
            ))
            .await
            .unwrap();
        app.clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/api-keys",
                &signup_b.access_token,
                json!({ "name": "B's key" }),
            ))
            .await
            .unwrap();

        let resp = app
            .clone()
            .oneshot(authed("GET", "/api/v1/portal/api-keys", &signup_a.access_token, json!({})))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let keys: Vec<ListedKey> = body_json(resp).await;
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].status, "active");
        assert!(!keys[0].public_key.is_empty());
    }

    #[tokio::test]
    async fn revoking_one_api_key_leaves_others_and_the_primary_secret_working() {
        let (ctx, _) = test_ctx().await;
        let auth = ctx.token_service.clone();
        let app = router(ctx);
        let signup_data = signup(&app, "revoke@example.com").await;

        let resp = app
            .clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/api-keys",
                &signup_data.access_token,
                json!({ "name": "Key A" }),
            ))
            .await
            .unwrap();
        let key_a: GeneratedKey = body_json(resp).await;
        let resp = app
            .clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/api-keys",
                &signup_data.access_token,
                json!({ "name": "Key B" }),
            ))
            .await
            .unwrap();
        let key_b: GeneratedKey = body_json(resp).await;

        let resp = app
            .clone()
            .oneshot(authed(
                "DELETE",
                &format!("/api/v1/portal/api-keys/{}", key_a.id),
                &signup_data.access_token,
                json!({}),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        assert!(!auth.verify_tenant_secret(signup_data.keys.tenant_id, key_a.secret.as_bytes()));
        assert!(auth.verify_tenant_secret(signup_data.keys.tenant_id, key_b.secret.as_bytes()));
        assert!(auth.verify_tenant_secret(signup_data.keys.tenant_id, signup_data.keys.secret_key.as_bytes()));

        let resp = app
            .clone()
            .oneshot(authed("GET", "/api/v1/portal/api-keys", &signup_data.access_token, json!({})))
            .await
            .unwrap();
        let keys: Vec<ListedKey> = body_json(resp).await;
        let revoked = keys.iter().find(|k| k.id == key_a.id).unwrap();
        assert_eq!(revoked.status, "revoked");

        // Revoking the same key again is a clean 404, not a 500.
        let resp = app
            .clone()
            .oneshot(authed(
                "DELETE",
                &format!("/api/v1/portal/api-keys/{}", key_a.id),
                &signup_data.access_token,
                json!({}),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn cannot_revoke_another_tenants_api_key() {
        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        let signup_a = signup(&app, "owner@example.com").await;
        let signup_b = signup(&app, "attacker@example.com").await;

        let resp = app
            .clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/api-keys",
                &signup_a.access_token,
                json!({ "name": "Owner's key" }),
            ))
            .await
            .unwrap();
        let key: GeneratedKey = body_json(resp).await;

        let resp = app
            .clone()
            .oneshot(authed(
                "DELETE",
                &format!("/api/v1/portal/api-keys/{}", key.id),
                &signup_b.access_token,
                json!({}),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn generating_an_api_key_with_an_empty_name_is_rejected() {
        let (ctx, _) = test_ctx().await;
        let app = router(ctx);
        let signup_data = signup(&app, "emptyname@example.com").await;

        let resp = app
            .clone()
            .oneshot(authed(
                "POST",
                "/api/v1/portal/api-keys",
                &signup_data.access_token,
                json!({ "name": "   " }),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }
}
