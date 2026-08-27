//! # PublishMessageHttpController
//!
//! **Action:** HTTP entry point for `POST /api/v1/messages`.
//! **Input:** JSON `PublishMessageDto` body, `Authorization: Bearer <token>`
//! header — the token must already have been minted via
//! `POST /api/v1/auth/tokens` (or issued directly server-side); this
//! endpoint never accepts a raw tenant secret.
//! **Output:** `200 OK` with `PublishMessageResponseDto`, or a typed error.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::auth::dto::ApiEnvelope;
use crate::modules::realtime::dto::PublishMessageDto::{PublishMessageDto, PublishMessageResponseDto};
use crate::modules::realtime::usecases::PublishMessageHttpUseCase::{self, PublishHttpError};
use crate::modules::realtime::RealtimeContext::RealtimeContext;

pub async fn handle(
    State(ctx): State<RealtimeContext>,
    headers: HeaderMap,
    Json(dto): Json<PublishMessageDto>,
) -> impl IntoResponse {
    let token = match bearer_token(&headers) {
        Some(token) => token,
        None => {
            return ApiEnvelope::error_response(
                StatusCode::UNAUTHORIZED,
                "MISSING_TOKEN",
                "missing or malformed Authorization: Bearer <token> header",
            )
        }
    };

    match PublishMessageHttpUseCase::execute(&ctx, dto, token) {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, PublishMessageResponseDto { published: true }),
        Err(err @ (PublishHttpError::ChannelIdTooLong | PublishHttpError::PayloadTooLarge)) => {
            ApiEnvelope::error_response(StatusCode::BAD_REQUEST, "INVALID_REQUEST", &err.to_string())
        }
        Err(err @ PublishHttpError::Unauthorized(_)) => {
            ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", &err.to_string())
        }
        Err(err @ PublishHttpError::RateLimited) => {
            ApiEnvelope::error_response(StatusCode::TOO_MANY_REQUESTS, "RATE_LIMITED", &err.to_string())
        }
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ")
}
