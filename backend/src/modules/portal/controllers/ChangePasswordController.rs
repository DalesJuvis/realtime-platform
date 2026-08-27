//! # ChangePasswordController
//!
//! **Action:** HTTP entry point for `PUT /api/v1/portal/account/password`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::ChangePasswordDto::ChangePasswordDto;
use crate::modules::portal::usecases::ChangePasswordUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Json(dto): Json<ChangePasswordDto>,
) -> impl IntoResponse {
    match ChangePasswordUseCase::execute(&ctx, session.user_id, dto).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, serde_json::json!({})),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
