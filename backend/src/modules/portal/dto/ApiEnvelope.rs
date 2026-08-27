//! # ApiEnvelope
//!
//! **Action:** Universal success/error response envelope for the Portal
//! REST API — same shape as `modules::admin::dto::ApiEnvelope`, duplicated
//! rather than shared since each module owns its full stack (BACKEND.md convention).
//! **Dependencies:** `axum`, `serde`, `uuid`.

use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
struct ApiErrorBody {
    code: String,
    message: String,
    trace_id: String,
}

#[derive(Serialize)]
struct ApiErrorEnvelope {
    success: bool,
    error: ApiErrorBody,
}

#[derive(Serialize)]
struct ApiSuccessEnvelope<T: Serialize> {
    success: bool,
    data: T,
    trace_id: String,
}

pub fn error_response(status: StatusCode, code: &str, message: &str) -> axum::response::Response {
    (
        status,
        Json(ApiErrorEnvelope {
            success: false,
            error: ApiErrorBody {
                code: code.to_string(),
                message: message.to_string(),
                trace_id: Uuid::new_v4().to_string(),
            },
        }),
    )
        .into_response()
}

pub fn success_response<T: Serialize>(status: StatusCode, data: T) -> axum::response::Response {
    (
        status,
        Json(ApiSuccessEnvelope {
            success: true,
            data,
            trace_id: Uuid::new_v4().to_string(),
        }),
    )
        .into_response()
}
