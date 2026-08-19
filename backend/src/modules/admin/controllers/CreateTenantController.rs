//! # CreateTenantController
//!
//! **Action:** HTTP entry point for `POST /api/v1/admin/tenants`.
//! **Input:** JSON `CreateTenantDto` body (guarded by `AdminTokenGuard`).
//! **Output:** `201 Created` with `TenantSecretResponseDto`.
//! **Side effects:** Delegates to `CreateTenantUseCase`.
//! **Dependencies:** `usecases::CreateTenantUseCase`.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::modules::admin::dto::ApiEnvelope;
use crate::modules::admin::dto::CreateTenantDto::CreateTenantDto;
use crate::modules::admin::usecases::CreateTenantUseCase;
use crate::modules::admin::AdminContext::AdminContext;

pub async fn handle(State(ctx): State<AdminContext>, Json(dto): Json<CreateTenantDto>) -> impl IntoResponse {
    let response = CreateTenantUseCase::execute(&ctx, dto);
    ApiEnvelope::success_response(StatusCode::CREATED, response)
}
