//! # OverviewResponseDto
//!
//! **Action:** Response shape for `GET /api/v1/portal/overview` — a
//! tenant-scoped summary. Never returns the raw `/api/v1/system/metrics`
//! text to a tenant: that text mixes every tenant's labeled series, and
//! handing it over would leak other tenants' activity. Scoping happens
//! server-side (`GetOverviewUseCase`), this DTO carries only the summary.

use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct OverviewResponseDto {
    pub tenant_id: Uuid,
    pub active_sessions: usize,
    pub messages_total: u64,
    pub rate_limited_total: u64,
    /// Split of `messages_total`'s underlying notification log by delivery
    /// path (see `NotificationDelivery`) — sourced from the `notifications`
    /// table rather than the Prometheus counters `messages_total`/
    /// `rate_limited_total` above read from, so it stays accurate across a
    /// process restart (Prometheus counters don't).
    pub realtime_messages_total: i64,
    pub push_messages_total: i64,
}
