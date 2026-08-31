//! # IssueClientTokenController
//!
//! **Action:** HTTP entry point for `POST /api/v1/auth/tokens`.
//! **Input:** JSON `IssueTokenDto` body — public (no bearer guard), but
//! nothing is returned unless the caller proves it holds the tenant's real
//! secret (see `IssueClientTokenUseCase`).
//! **Output:** `200 OK` with `TokenResponseDto`, or a typed error.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::auth::dto::ApiEnvelope;
use crate::modules::auth::dto::IssueTokenDto::IssueTokenDto;
use crate::modules::auth::services::WsUrlService::derive_ws_url;
use crate::modules::auth::usecases::IssueClientTokenUseCase;
use crate::modules::auth::AuthApiContext::AuthApiContext;

pub async fn handle(
    State(ctx): State<AuthApiContext>,
    headers: HeaderMap,
    Json(dto): Json<IssueTokenDto>,
) -> impl IntoResponse {
    let ws_url = derive_ws_url(&headers, ctx.public_ws_url.as_deref());
    match IssueClientTokenUseCase::execute(&ctx.token_service, dto, ws_url) {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "INVALID_TENANT_SECRET", &err.to_string()),
    }
}
