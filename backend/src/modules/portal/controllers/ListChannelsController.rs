//! # ListChannelsController
//!
//! **Action:** HTTP entry point for `GET /api/v1/portal/channels`.
//! **Input:** Validated `PortalSession`.
//! **Output:** `200 OK` with `Vec<ChannelSummaryDto>`.
//! **Side effects:** Delegates to `ListChannelsUseCase`.

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::usecases::ListChannelsUseCase;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Extension(session): Extension<PortalSession>) -> impl IntoResponse {
    let channels = ListChannelsUseCase::execute(&ctx, session.tenant_id);
    ApiEnvelope::success_response(StatusCode::OK, channels)
}
