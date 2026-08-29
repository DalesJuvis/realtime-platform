//! # ListApiKeysController
//!
//! **Action:** HTTP entry point for `GET /api/v1/portal/api-keys`.
//! **Input:** Validated `PortalSession`.
//! **Output:** `200 OK` with `Vec<ApiKeyDto>`, or a typed error.
//! **Side effects:** Delegates to `ListApiKeysUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::usecases::ListApiKeysUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Extension(session): Extension<PortalSession>) -> impl IntoResponse {
    match ListApiKeysUseCase::execute(&ctx, session.tenant_id).await {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
