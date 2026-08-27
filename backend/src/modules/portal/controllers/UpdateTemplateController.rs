//! # UpdateTemplateController
//!
//! **Action:** HTTP entry point for `PUT /api/v1/portal/templates/:id`.
//! **Input:** Validated `PortalSession`, template ID path param, JSON
//! `SaveTemplateDto` body.
//! **Output:** `200 OK` with an empty envelope, or a typed error.
//! **Side effects:** Delegates to `UpdateTemplateUseCase`.

use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::TemplateDto::SaveTemplateDto;
use crate::modules::portal::usecases::UpdateTemplateUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Path(id): Path<Uuid>,
    Json(dto): Json<SaveTemplateDto>,
) -> impl IntoResponse {
    match UpdateTemplateUseCase::execute(&ctx, session.tenant_id, id, dto).await {
        Ok(()) => ApiEnvelope::success_response(StatusCode::OK, serde_json::json!({})),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
