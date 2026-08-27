//! # MintTenantTokenController
//!
//! **Action:** HTTP entry point for `POST /api/v1/admin/tenants/:id/tokens`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use crate::modules::admin::dto::ApiEnvelope;
use crate::modules::admin::dto::MintTokenDto::AdminMintTokenDto;
use crate::modules::admin::usecases::MintTenantTokenUseCase;
use crate::modules::admin::AdminContext::AdminContext;

pub async fn handle(
    State(ctx): State<AdminContext>,
    Path(tenant_id): Path<Uuid>,
    Json(dto): Json<AdminMintTokenDto>,
) -> impl IntoResponse {
    match MintTenantTokenUseCase::execute(&ctx, tenant_id, dto) {
        Ok(response) => ApiEnvelope::success_response(StatusCode::OK, response),
        Err(err) => ApiEnvelope::error_response(StatusCode::NOT_FOUND, "UNKNOWN_TENANT", &err.to_string()),
    }
}
