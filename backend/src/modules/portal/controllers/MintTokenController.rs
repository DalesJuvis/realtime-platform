//! # MintTokenController
//!
//! **Action:** HTTP entry point for `POST /api/v1/portal/tokens`.
//! **Input:** Validated `PortalSession`, JSON `MintTokenDto` body.
//! **Output:** `200 OK` with `ClientTokenResponseDto`, or a typed error.
//! **Side effects:** Delegates to `MintClientTokenUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::MintTokenDto::MintTokenDto;
use crate::modules::portal::usecases::MintClientTokenUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Json(dto): Json<MintTokenDto>,
) -> impl IntoResponse {
    match MintClientTokenUseCase::execute(&ctx, session.tenant_id, dto) {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
