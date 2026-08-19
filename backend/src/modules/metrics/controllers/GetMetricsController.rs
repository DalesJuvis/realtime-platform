//! # GetMetricsController
//!
//! **Action:** Serves the Prometheus scraping endpoint.
//! **Input:** `GET /api/v1/system/metrics` (no auth — standard for scraping endpoints).
//! **Output:** `200 OK`, Prometheus text exposition body.
//! **Side effects:** None.
//! **Dependencies:** `services::MetricsService`.
//!
//! Deliberately **unauthenticated**, as is standard for this kind of
//! endpoint (a Prometheus server generally doesn't present a Bearer
//! token) — protection comes from this port never being exposed publicly
//! by construction (see the Admin API module docs).

use axum::extract::State;
use axum::response::IntoResponse;
use axum::http::StatusCode;

use crate::modules::admin::AdminContext::AdminContext;

pub async fn handle(State(ctx): State<AdminContext>) -> impl IntoResponse {
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        ctx.metrics.render(),
    )
}
