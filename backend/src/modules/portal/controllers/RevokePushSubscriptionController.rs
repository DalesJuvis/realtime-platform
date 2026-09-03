//! # RevokePushSubscriptionController
//!
//! **Action:** HTTP entry point for `DELETE /api/v1/portal/push-subscriptions`.
//! **Input:** Validated `PortalSession`, `{ endpoint }` JSON body.
//! **Output:** `200 OK` with an empty envelope, or a typed error.
//! **Side effects:** Delegates to `RevokePushSubscriptionUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::PushSubscriptionSummaryDto::RevokePushSubscriptionDto;
use crate::modules::portal::usecases::RevokePushSubscriptionUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Json(dto): Json<RevokePushSubscriptionDto>,
) -> impl IntoResponse {
    match RevokePushSubscriptionUseCase::execute(&ctx, session.tenant_id, &dto.endpoint).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, serde_json::json!({})),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
