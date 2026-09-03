//! # MarkAllNotificationsReadController
//!
//! **Action:** HTTP entry point for `POST /api/v1/portal/notifications/read-all`.
//! **Input:** Validated `PortalSession`.
//! **Output:** `200 OK` with an empty envelope, or a typed error.
//! **Side effects:** Delegates to `MarkAllNotificationsReadUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::usecases::MarkAllNotificationsReadUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Extension(session): Extension<PortalSession>) -> impl IntoResponse {
    match MarkAllNotificationsReadUseCase::execute(&ctx, session.tenant_id).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, serde_json::json!({})),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
