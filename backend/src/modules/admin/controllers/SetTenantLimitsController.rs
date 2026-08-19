//! # SetTenantLimitsController
//!
//! **Action:** HTTP entry point for `PUT /api/v1/admin/tenants/:id/limits`.
//! **Input:** Tenant ID path param, JSON `RateLimitConfig` body (guarded by `AdminTokenGuard`).
//! **Output:** `204 No Content`.
//! **Side effects:** Delegates to `SetTenantLimitsUseCase`.
//! **Dependencies:** `usecases::SetTenantLimitsUseCase`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use uuid::Uuid;

use crate::entities::RateLimitConfig::RateLimitConfig;
use crate::modules::admin::usecases::SetTenantLimitsUseCase;
use crate::modules::admin::AdminContext::AdminContext;

pub async fn handle(
    State(ctx): State<AdminContext>,
    Path(tenant_id): Path<Uuid>,
    Json(limits): Json<RateLimitConfig>,
) -> StatusCode {
    SetTenantLimitsUseCase::execute(&ctx, tenant_id, limits);
    StatusCode::NO_CONTENT
}
