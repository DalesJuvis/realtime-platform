//! # PushSubscriptionController
//!
//! **Action:** HTTP entry points for `POST`/`DELETE
//! /api/v1/push/subscriptions`.
//! **Input:** JSON body, `Authorization: Bearer <token>` header — same
//! token kind as `PublishMessageHttpController`, never a raw tenant secret.
//! **Output:** `200 OK` with `PushSubscriptionResponseDto`, or a typed error.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::auth::dto::ApiEnvelope;
use crate::modules::realtime::dto::PushSubscriptionDto::{
    PushSubscriptionResponseDto, RegisterPushSubscriptionDto, UnregisterPushSubscriptionDto,
};
use crate::modules::realtime::usecases::RegisterPushSubscriptionUseCase::{self, RegisterPushSubscriptionError};
use crate::modules::realtime::usecases::UnregisterPushSubscriptionUseCase::{self, UnregisterPushSubscriptionError};
use crate::modules::realtime::RealtimeContext::RealtimeContext;

pub async fn register(
    State(ctx): State<RealtimeContext>,
    headers: HeaderMap,
    Json(dto): Json<RegisterPushSubscriptionDto>,
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

    match RegisterPushSubscriptionUseCase::execute(&ctx, dto, token).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, PushSubscriptionResponseDto { registered: true }),
        Err(err @ RegisterPushSubscriptionError::Unauthorized(_)) => {
            ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", &err.to_string())
        }
        Err(err @ RegisterPushSubscriptionError::Storage(_)) => {
            tracing::error!(error = %err, "failed to store push subscription");
            ApiEnvelope::error_response(StatusCode::INTERNAL_SERVER_ERROR, "STORAGE_ERROR", "failed to store subscription")
        }
    }
}

pub async fn unregister(
    State(ctx): State<RealtimeContext>,
    headers: HeaderMap,
    Json(dto): Json<UnregisterPushSubscriptionDto>,
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

    match UnregisterPushSubscriptionUseCase::execute(&ctx, dto, token).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, PushSubscriptionResponseDto { registered: false }),
        Err(err @ UnregisterPushSubscriptionError::Unauthorized(_)) => {
            ApiEnvelope::error_response(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", &err.to_string())
        }
        Err(err @ UnregisterPushSubscriptionError::Storage(_)) => {
            tracing::error!(error = %err, "failed to remove push subscription");
            ApiEnvelope::error_response(StatusCode::INTERNAL_SERVER_ERROR, "STORAGE_ERROR", "failed to remove subscription")
        }
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ")
}
