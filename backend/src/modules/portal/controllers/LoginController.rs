//! # LoginController
//!
//! **Action:** HTTP entry point for `POST /api/v1/portal/auth/login`.
//! **Input:** JSON `LoginDto` body (public).
//! **Output:** `200 OK` with `SessionTokenResponseDto`, or a typed error.
//! **Side effects:** Delegates to `LoginUseCase`.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::LoginDto::LoginDto;
use crate::modules::portal::usecases::LoginUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Json(dto): Json<LoginDto>) -> impl IntoResponse {
    match LoginUseCase::execute(&ctx, dto).await {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
