//! # IssueClientTokenController
//!
//! **Action:** HTTP entry point for `POST /api/v1/auth/tokens`.
//! **Input:** JSON `IssueTokenDto` body — public (no bearer guard), but
//! nothing is returned unless the caller proves it holds the tenant's real
//! secret (see `IssueClientTokenUseCase`).
//! **Output:** `200 OK` with `TokenResponseDto`, or a typed error.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::auth::dto::ApiEnvelope;
use crate::modules::auth::dto::IssueTokenDto::IssueTokenDto;
use crate::modules::auth::usecases::IssueClientTokenUseCase;
use crate::modules::auth::AuthApiContext::AuthApiContext;

pub async fn handle(State(ctx): State<AuthApiContext>, Json(dto): Json<IssueTokenDto>) -> impl IntoResponse {
    match IssueClientTokenUseCase::execute(&ctx.token_service, dto) {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "INVALID_TENANT_SECRET", &err.to_string()),
    }
}
