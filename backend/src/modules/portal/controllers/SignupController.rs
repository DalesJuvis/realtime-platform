//! # SignupController
//!
//! **Action:** HTTP entry point for `POST /api/v1/portal/auth/signup`.
//! **Input:** JSON `SignupDto` body (public — this is the self-serve
//! "create account" step, nothing to prove ownership of yet).
//! **Output:** `201 Created` with `SignupResponseDto`, or a typed error.
//! **Side effects:** Delegates to `SignupTenantUseCase`.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::SignupDto::SignupDto;
use crate::modules::portal::usecases::SignupTenantUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Json(dto): Json<SignupDto>) -> impl IntoResponse {
    match SignupTenantUseCase::execute(&ctx, dto).await {
        Ok(response) => ApiEnvelope::success_response(StatusCode::CREATED, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
