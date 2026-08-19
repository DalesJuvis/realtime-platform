//! # AdminTokenGuard
//!
//! **Action:** `admin` segment guard (BACKEND.md §7) — validates
//! `Authorization: Bearer <ADMIN_API_TOKEN>` on every protected admin route.
//! **Input:** Request headers, `AdminContext`.
//! **Output:** Passes the request through on success; `401` JSON envelope otherwise.
//! **Side effects:** None.
//! **Dependencies:** `subtle` (constant-time comparison), `dto::ApiEnvelope`.
//!
//! Applied as a real Axum middleware layer via `route_layer`, matching the
//! "Segment Middleware & Guards" table: admin-segment routes require this
//! guard; system-segment routes (`/healthz`, `/metrics`) intentionally do not.

use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use subtle::ConstantTimeEq;

use crate::modules::admin::dto::ApiEnvelope;
use crate::modules::admin::AdminContext::AdminContext;

/// Compares the request's `Authorization: Bearer <...>` token to the
/// expected admin token in constant time, to avoid leaking information
/// about a correct prefix via comparison timing.
fn is_authorized(headers: &HeaderMap, expected: &str) -> bool {
    let Some(raw) = headers.get(axum::http::header::AUTHORIZATION).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    let Some(token) = raw.strip_prefix("Bearer ") else {
        return false;
    };
    // `ct_eq` requires equal-length slices to be truly constant-time; a
    // length mismatch leaks very little here (we compare against a fixed
    // server-side secret, not sensitive third-party data) — an acceptable trade-off.
    token.as_bytes().ct_eq(expected.as_bytes()).into()
}

pub async fn require_admin_token(State(ctx): State<AdminContext>, request: Request, next: Next) -> Response {
    if !is_authorized(request.headers(), &ctx.admin_token) {
        return ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "invalid admin token");
    }
    next.run(request).await
}
