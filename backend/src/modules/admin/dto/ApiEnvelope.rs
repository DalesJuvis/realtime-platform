//! # ApiEnvelope
//!
//! **Action:** Universal success/error response envelope for the Admin
//! REST API (BACKEND.md §16).
//! **Input:** A status code, error code, and message; or a success payload.
//! **Output:** JSON `{ success, data | error, trace_id }`.
//! **Side effects:** None — pure response construction.
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

/// Builds a typed JSON error response: `{ success: false, error: { code, message, trace_id } }`.
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

/// Builds a typed JSON success response: `{ success: true, data, trace_id }`.
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
