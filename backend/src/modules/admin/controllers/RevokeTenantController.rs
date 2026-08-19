//! # RevokeTenantController
//!
//! **Action:** HTTP entry point for `DELETE /api/v1/admin/tenants/:id`.
//! **Input:** Tenant ID path param (guarded by `AdminTokenGuard`).
//! **Output:** `204 No Content`.
//! **Side effects:** Delegates to `RevokeTenantUseCase`.
//! **Dependencies:** `usecases::RevokeTenantUseCase`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use crate::modules::admin::usecases::RevokeTenantUseCase;
use crate::modules::admin::AdminContext::AdminContext;

pub async fn handle(State(ctx): State<AdminContext>, Path(tenant_id): Path<Uuid>) -> StatusCode {
    RevokeTenantUseCase::execute(&ctx, tenant_id);
    StatusCode::NO_CONTENT
}
