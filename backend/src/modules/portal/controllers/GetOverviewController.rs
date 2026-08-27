//! # GetOverviewController
//!
//! **Action:** HTTP entry point for `GET /api/v1/portal/overview`.
//! **Input:** Validated `PortalSession`.
//! **Output:** `200 OK` with `OverviewResponseDto`.
//! **Side effects:** Delegates to `GetOverviewUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::usecases::GetOverviewUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Extension(session): Extension<PortalSession>) -> impl IntoResponse {
    let overview = GetOverviewUseCase::execute(&ctx, session.tenant_id);
    ApiEnvelope::success_response(StatusCode::OK, overview)
}
