//! # RegisterController
//!
//! **Action:** HTTP entry point for `POST /api/v1/portal/auth/register`.
//! **Input:** JSON `RegisterDto` body (public — proves ownership via the tenant secret itself).
//! **Output:** `201 Created` with `SessionTokenResponseDto`, or a typed error.
//! **Side effects:** Delegates to `RegisterTenantUserUseCase`.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::RegisterDto::RegisterDto;
use crate::modules::portal::usecases::RegisterTenantUserUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Json(dto): Json<RegisterDto>) -> impl IntoResponse {
    match RegisterTenantUserUseCase::execute(&ctx, dto).await {
        Ok(response) => ApiEnvelope::success_response(StatusCode::CREATED, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
