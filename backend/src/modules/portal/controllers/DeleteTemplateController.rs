//! # DeleteTemplateController
//!
//! **Action:** HTTP entry point for `DELETE /api/v1/portal/templates/:id`.
//! **Input:** Validated `PortalSession`, template ID path param.
//! **Output:** `200 OK` with an empty envelope, or a typed error.
//! **Side effects:** Delegates to `DeleteTemplateUseCase`.

use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use uuid::Uuid;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::usecases::DeleteTemplateUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match DeleteTemplateUseCase::execute(&ctx, session.tenant_id, id).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, serde_json::json!({})),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
