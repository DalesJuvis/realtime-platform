//! # PublishTemplateHttpController
//!
//! **Action:** HTTP entry point for `POST /api/v1/messages/template`.
//! **Input:** JSON `PublishTemplateDto` body, `Authorization: Bearer <token>`
//! header — same bearer client token as `POST /api/v1/messages`, never a
//! raw tenant secret.
//! **Output:** `200 OK` with `PublishTemplateResponseDto`, or a typed error.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::auth::dto::ApiEnvelope;
use crate::modules::realtime::dto::PublishTemplateDto::{PublishTemplateDto, PublishTemplateResponseDto};
use crate::modules::realtime::usecases::PublishTemplateHttpUseCase::{self, PublishTemplateError};
use crate::modules::realtime::RealtimeContext::RealtimeContext;

pub async fn handle(
    State(ctx): State<RealtimeContext>,
    headers: HeaderMap,
    Json(dto): Json<PublishTemplateDto>,
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

    match PublishTemplateHttpUseCase::execute(&ctx, dto, token).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, PublishTemplateResponseDto { published: true }),
        Err(err @ (PublishTemplateError::ChannelIdTooLong | PublishTemplateError::PayloadTooLarge)) => {
            ApiEnvelope::error_response(StatusCode::BAD_REQUEST, "INVALID_REQUEST", &err.to_string())
        }
        Err(err @ PublishTemplateError::Unauthorized(_)) => {
            ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", &err.to_string())
        }
        Err(err @ PublishTemplateError::TemplateNotFound) => {
            ApiEnvelope::error_response(StatusCode::NOT_FOUND, "TEMPLATE_NOT_FOUND", &err.to_string())
        }
        Err(err @ PublishTemplateError::RateLimited) => {
            ApiEnvelope::error_response(StatusCode::TOO_MANY_REQUESTS, "RATE_LIMITED", &err.to_string())
        }
        Err(err @ PublishTemplateError::Storage(_)) => {
            tracing::error!(error = %err, "storage error while publishing a template");
            ApiEnvelope::error_response(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "internal error")
        }
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ")
}
