//! # RotateTenantSecretController
//!
//! **Action:** HTTP entry point for `PUT /api/v1/admin/tenants/:id/secret`.
//! **Input:** Tenant ID path param, JSON `RotateSecretDto` body (guarded by `AdminTokenGuard`).
//! **Output:** `200 OK` with `TenantSecretResponseDto`.
//! **Side effects:** Delegates to `RotateTenantSecretUseCase`.
//! **Dependencies:** `usecases::RotateTenantSecretUseCase`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use crate::modules::admin::dto::ApiEnvelope;
use crate::modules::admin::dto::RotateSecretDto::RotateSecretDto;
use crate::modules::admin::usecases::RotateTenantSecretUseCase;
use crate::modules::admin::AdminContext::AdminContext;

pub async fn handle(
    State(ctx): State<AdminContext>,
    Path(tenant_id): Path<Uuid>,
    Json(dto): Json<RotateSecretDto>,
) -> impl IntoResponse {
    let response = RotateTenantSecretUseCase::execute(&ctx, tenant_id, dto);
    ApiEnvelope::success_response(StatusCode::OK, response)
}
