//! # CreateTemplateController
//!
//! **Action:** HTTP entry point for `POST /api/v1/portal/templates`.
//! **Input:** Validated `PortalSession`, JSON `SaveTemplateDto` body.
//! **Output:** `201 Created` with `TemplateResponseDto`, or a typed error.
//! **Side effects:** Delegates to `CreateTemplateUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::TemplateDto::SaveTemplateDto;
use crate::modules::portal::usecases::CreateTemplateUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Json(dto): Json<SaveTemplateDto>,
) -> impl IntoResponse {
    match CreateTemplateUseCase::execute(&ctx, session.tenant_id, dto).await {
        Ok(response) => ApiEnvelope::success_response(StatusCode::CREATED, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
