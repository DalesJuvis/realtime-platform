//! # PortalSessionGuard
//!
//! **Action:** Validates `Authorization: Bearer <session token>` on every
//! protected portal route, and injects the decoded `PortalSession` into
//! request extensions so controllers can scope their usecase call to
//! `session.tenant_id` — never a caller-supplied tenant ID, unlike the
//! Admin API's `:id` path params (this is the whole point of the portal
//! being tenant-scoped rather than platform-wide).
//! **Dependencies:** `portal::services::PortalAuthService`, `dto::ApiEnvelope`.

use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::Response;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::PortalContext::PortalContext;

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|raw| raw.strip_prefix("Bearer "))
}

pub async fn require_portal_session(State(ctx): State<PortalContext>, mut request: Request, next: Next) -> Response {
    let Some(token) = bearer_token(request.headers()) else {
        return ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "missing bearer token");
    };

    let session: PortalSession = match ctx.portal_auth.validate_session(token) {
        Ok(session) => session,
        Err(err) => {
            return ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", &err.to_string());
        }
    };

    request.extensions_mut().insert(session);
    next.run(request).await
}
