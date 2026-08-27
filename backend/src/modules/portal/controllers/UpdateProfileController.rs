//! # UpdateProfileController
//!
//! **Action:** HTTP entry point for `PUT /api/v1/portal/profile`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::WorkspaceProfileDto::UpdateProfileDto;
use crate::modules::portal::usecases::UpdateWorkspaceProfileUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(
    State(ctx): State<PortalContext>,
    Extension(session): Extension<PortalSession>,
    Json(dto): Json<UpdateProfileDto>,
) -> impl IntoResponse {
    match UpdateWorkspaceProfileUseCase::execute(&ctx, session.tenant_id, dto).await {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(err.status_code(), err.code(), &err.to_string()),
    }
}
