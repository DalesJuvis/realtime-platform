//! # ListSessionsController
//!
//! **Action:** HTTP entry point for `GET /api/v1/portal/sessions`.
//! **Input:** Validated `PortalSession` (guarded by `PortalSessionGuard`).
//! **Output:** `200 OK` with `Vec<SessionSummaryDto>`.
//! **Side effects:** Delegates to `ListSessionsUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::usecases::ListSessionsUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Extension(session): Extension<PortalSession>) -> impl IntoResponse {
    let sessions = ListSessionsUseCase::execute(&ctx, session.tenant_id);
    ApiEnvelope::success_response(StatusCode::OK, sessions)
}
