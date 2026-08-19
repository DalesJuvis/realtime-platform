//! `admin.rs` — API REST interne d'administration (Axum, **port séparé**
//! du trafic temps réel) pour créer, révoquer ou reconfigurer les tenants
//! à chaud, sans redémarrer le service (roadmap "Gestion des clés d'API &
//! Dynamic Tenant Management").
//!
//! ## Sécurité
//! - Cette API écoute sur un port dédié (`ADMIN_BIND_ADDR`) qui ne doit
//!   **jamais** être exposé publiquement — à réserver au réseau interne,
//!   à un VPN, ou à un sidecar mTLS selon l'environnement de déploiement.
//! - Chaque requête doit porter `Authorization: Bearer <ADMIN_API_TOKEN>`,
//!   comparé en temps constant (`subtle::ConstantTimeEq`) pour éviter les
//!   attaques par timing sur le jeton d'admin lui-même.
//! - Les secrets tenant sont générés côté serveur par défaut (32 octets
//!   aléatoires cryptographiquement sûrs) et ne sont renvoyés en clair
//!   qu'une seule fois, dans la réponse de création/rotation — comme un
//!   mot de passe, ils ne sont jamais stockés ni relogués en clair.
//!
//! ## Endpoints
//! - `POST   /tenants`              — crée un tenant (ID + secret générés si absents)
//! - `DELETE /tenants/:id`          — révoque un tenant (auth + rate limit)
//! - `PUT    /tenants/:id/secret`   — fait tourner le secret HMAC d'un tenant
//! - `PUT    /tenants/:id/limits`   — ajuste les quotas de rate limiting d'un tenant
//! - `GET    /healthz`              — sonde de vie, non authentifiée

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::auth::AuthManager;
use crate::metrics::Metrics;
use crate::rate_limit::{RateLimitConfig, RateLimiter};

/// Contexte injecté dans les handlers de l'API d'admin. Volontairement
/// distinct de `ServerContext` (utilisé par le trafic temps réel) : cette
/// API n'a besoin ni du dispatcher push, ni de l'état des canaux.
#[derive(Clone)]
pub struct AdminContext {
    pub auth: Arc<AuthManager>,
    pub rate_limiter: Arc<RateLimiter>,
    pub admin_token: Arc<String>,
    pub metrics: Arc<Metrics>,
}

pub fn admin_router(ctx: AdminContext) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/metrics", get(metrics_endpoint))
        .route("/tenants", post(create_tenant))
        .route("/tenants/:id", delete(revoke_tenant))
        .route("/tenants/:id/secret", put(rotate_secret))
        .route("/tenants/:id/limits", put(update_limits))
        .with_state(ctx)
}

async fn health() -> &'static str {
    "ok"
}

/// Endpoint de scraping Prometheus. Volontairement **non authentifié**,
/// comme c'est l'usage standard pour ce type d'endpoint (le serveur
/// Prometheus ne présente généralement pas de jeton Bearer) — la
/// protection vient du fait que ce port (9090) n'est, par construction,
/// jamais exposé publiquement (cf. doc de tête de ce fichier).
async fn metrics_endpoint(State(ctx): State<AdminContext>) -> impl IntoResponse {
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        ctx.metrics.render(),
    )
}

/// Compare le jeton `Authorization: Bearer <...>` de la requête au jeton
/// admin attendu, en temps constant pour ne pas fuiter d'information sur
/// un préfixe correct via le timing de la comparaison.
fn is_authorized(headers: &HeaderMap, expected: &str) -> bool {
    let Some(raw) = headers.get(axum::http::header::AUTHORIZATION).and_then(|v| v.to_str().ok())
    else {
        return false;
    };
    let Some(token) = raw.strip_prefix("Bearer ") else {
        return false;
    };
    // `ct_eq` exige des slices de même longueur pour être réellement en
    // temps constant ; une différence de longueur fuite déjà peu (on
    // compare à un secret fixe côté serveur, pas à des données tierces
    // sensibles), c'est un compromis acceptable ici.
    token.as_bytes().ct_eq(expected.as_bytes()).into()
}

/// Génère un secret aléatoire de 256 bits, encodé en base64url, pour les
/// tenants créés/rotés sans secret explicite fourni par l'appelant.
fn generate_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

#[derive(Deserialize)]
struct CreateTenantRequest {
    /// Optionnel : si omis, un nouvel UUID v4 est généré côté serveur.
    tenant_id: Option<Uuid>,
    /// Optionnel : si omis, un secret aléatoire de 256 bits est généré.
    secret: Option<String>,
    /// Optionnel : quotas de rate limiting spécifiques à ce tenant.
    limits: Option<RateLimitConfig>,
}

#[derive(Serialize)]
struct TenantSecretResponse {
    tenant_id: Uuid,
    /// Affiché une seule fois — le client doit le stocker immédiatement.
    secret: String,
}

async fn create_tenant(
    State(ctx): State<AdminContext>,
    headers: HeaderMap,
    Json(req): Json<CreateTenantRequest>,
) -> impl IntoResponse {
    if !is_authorized(&headers, &ctx.admin_token) {
        return (StatusCode::UNAUTHORIZED, "jeton admin invalide").into_response();
    }

    let tenant_id = req.tenant_id.unwrap_or_else(Uuid::new_v4);
    let secret = req.secret.unwrap_or_else(generate_secret);

    ctx.auth.register_tenant(tenant_id, secret.clone().into_bytes());
    if let Some(limits) = req.limits {
        ctx.rate_limiter.set_tenant_limits(tenant_id, limits);
    }

    tracing::info!(%tenant_id, "tenant créé via l'Admin API");
    (
        StatusCode::CREATED,
        Json(TenantSecretResponse { tenant_id, secret }),
    )
        .into_response()
}

async fn revoke_tenant(
    State(ctx): State<AdminContext>,
    headers: HeaderMap,
    Path(tenant_id): Path<Uuid>,
) -> impl IntoResponse {
    if !is_authorized(&headers, &ctx.admin_token) {
        return StatusCode::UNAUTHORIZED;
    }
    // Révoque l'authentification ET les quotas spécifiques : un tenant
    // révoqué ne doit laisser aucune trace de configuration active.
    ctx.auth.revoke_tenant(tenant_id);
    ctx.rate_limiter.clear_tenant_limits(tenant_id);
    tracing::info!(%tenant_id, "tenant révoqué via l'Admin API");
    StatusCode::NO_CONTENT
}

#[derive(Deserialize)]
struct RotateSecretRequest {
    /// Optionnel : si omis, un nouveau secret aléatoire est généré.
    secret: Option<String>,
}

async fn rotate_secret(
    State(ctx): State<AdminContext>,
    headers: HeaderMap,
    Path(tenant_id): Path<Uuid>,
    Json(req): Json<RotateSecretRequest>,
) -> impl IntoResponse {
    if !is_authorized(&headers, &ctx.admin_token) {
        return (StatusCode::UNAUTHORIZED, Json(None::<TenantSecretResponse>)).into_response();
    }

    let secret = req.secret.unwrap_or_else(generate_secret);
    // `register_tenant` fait un upsert : appeler cette route sur un
    // tenant inexistant équivaut à le créer, ce qui est un comportement
    // idempotent raisonnable pour une route de rotation.
    ctx.auth.register_tenant(tenant_id, secret.clone().into_bytes());

    tracing::info!(%tenant_id, "secret roté via l'Admin API");
    (
        StatusCode::OK,
        Json(Some(TenantSecretResponse { tenant_id, secret })),
    )
        .into_response()
}

async fn update_limits(
    State(ctx): State<AdminContext>,
    headers: HeaderMap,
    Path(tenant_id): Path<Uuid>,
    Json(limits): Json<RateLimitConfig>,
) -> impl IntoResponse {
    if !is_authorized(&headers, &ctx.admin_token) {
        return StatusCode::UNAUTHORIZED;
    }
    ctx.rate_limiter.set_tenant_limits(tenant_id, limits);
    tracing::info!(%tenant_id, "quotas mis à jour via l'Admin API");
    StatusCode::NO_CONTENT
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode as SC};
    use tower::ServiceExt; // pour `Router::oneshot`

    fn test_ctx() -> AdminContext {
        AdminContext {
            auth: Arc::new(AuthManager::new()),
            rate_limiter: Arc::new(RateLimiter::new(RateLimitConfig::default())),
            admin_token: Arc::new("test-admin-token".to_string()),
            metrics: Metrics::new(),
        }
    }

    #[tokio::test]
    async fn rejects_missing_bearer_token() {
        let app = admin_router(test_ctx());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/tenants")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), SC::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn creates_tenant_with_generated_secret() {
        let ctx = test_ctx();
        let auth = ctx.auth.clone();
        let app = admin_router(ctx);

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/tenants")
                    .header("content-type", "application/json")
                    .header("authorization", "Bearer test-admin-token")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), SC::CREATED);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let parsed: TenantSecretResponse = serde_json::from_slice(&body).unwrap();
        assert!(!parsed.secret.is_empty());

        // Le tenant créé doit maintenant pouvoir émettre un jeton valide.
        assert!(auth.issue_token(parsed.tenant_id, "user-1", 60).is_ok());
    }

    #[tokio::test]
    async fn health_endpoint_requires_no_auth() {
        let app = admin_router(test_ctx());
        let resp = app
            .oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), SC::OK);
    }
}
