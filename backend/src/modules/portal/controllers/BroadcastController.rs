//! # BroadcastController
//!
//! **Action:** HTTP entry point for `POST /api/v1/portal/broadcast`.
//! **Input:** Validated `PortalSession`, JSON `BroadcastDto` body.
//! **Output:** `200 OK` with `BroadcastResponseDto`, or a typed error.
//! **Side effects:** Delegates to `BroadcastMessageUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::BroadcastDto::BroadcastDto;
use crate::modules::portal::usecases::BroadcastMessageUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Json(dto): Json<BroadcastDto>,
) -> impl IntoResponse {
    match BroadcastMessageUseCase::execute(&ctx, session.tenant_id, dto) {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
