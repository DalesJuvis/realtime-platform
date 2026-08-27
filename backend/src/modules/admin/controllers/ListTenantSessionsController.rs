//! # ListTenantSessionsController
//!
//! **Action:** HTTP entry point for `GET /api/v1/admin/tenants/:id/sessions`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use uuid::Uuid;

use crate::modules::admin::dto::ApiEnvelope;
use crate::modules::admin::usecases::ListTenantSessionsUseCase;
use crate::modules::admin::AdminContext::AdminContext;

pub async fn handle(State(ctx): State<AdminContext>, Path(tenant_id): Path<Uuid>) -> impl IntoResponse {
    let sessions = ListTenantSessionsUseCase::execute(&ctx, tenant_id);
    ApiEnvelope::success_response(StatusCode::OK, sessions)
}
