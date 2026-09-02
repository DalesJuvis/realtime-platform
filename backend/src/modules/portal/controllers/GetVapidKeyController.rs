//! # GetVapidKeyController
//!
//! **Action:** HTTP entry point for `GET /api/v1/portal/vapid-key`.
//! **Input:** Validated `PortalSession` (any signed-in tenant on this
//! instance sees the same value — see `VapidKeyDto`'s doc comment on why
//! this isn't tenant-scoped data).
//! **Output:** `200 OK` with `VapidKeyDto`.
//! **Side effects:** None — reads already-loaded config off `PortalContext`,
//! no use case/repository involved (there's no domain logic here to test).

use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::entities::PortalSession::PortalSession;
use crate::modules::portal::dto::ApiEnvelope;
use crate::modules::portal::dto::VapidKeyDto::VapidKeyDto;
use crate::modules::portal::PortalContext::PortalContext;

pub async fn handle(State(ctx): State<PortalContext>, Extension(_session): Extension<PortalSession>) -> impl IntoResponse {
    ApiEnvelope::success_response(
        StatusCode::OK,
        VapidKeyDto {
            vapid_public_key: ctx.vapid_public_key.map(|k| k.to_string()),
        },
    )
}
