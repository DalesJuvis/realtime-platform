//! # MarkNotificationReadController
//!
//! **Action:** HTTP entry point for `POST /api/v1/portal/notifications/:id/read`.
//! **Input:** Validated `PortalSession`, notification ID path param.
//! **Output:** `200 OK` with an empty envelope, or a typed error.
//! **Side effects:** Delegates to `MarkNotificationReadUseCase`.

use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use uuid::Uuid;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::usecases::MarkNotificationReadUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match MarkNotificationReadUseCase::execute(&ctx, session.tenant_id, id).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, serde_json::json!({})),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
