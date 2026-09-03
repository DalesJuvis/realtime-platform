//! # ListNotificationsController
//!
//! **Action:** HTTP entry point for `GET /api/v1/portal/notifications`.
//! **Input:** Validated `PortalSession`.
//! **Output:** `200 OK` with `NotificationListResponseDto`, or a typed error.
//! **Side effects:** Delegates to `ListNotificationsUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::usecases::ListNotificationsUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Extension(session): Extension<PortalSession>) -> impl IntoResponse {
    match ListNotificationsUseCase::execute(&ctx, session.tenant_id).await {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
