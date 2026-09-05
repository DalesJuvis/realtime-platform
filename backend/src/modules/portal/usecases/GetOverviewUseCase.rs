//! # GetOverviewUseCase
//!
//! **Action:** Tenant-scoped activity summary — active session count (real,
//! from `PresenceService`), a sum of this tenant's labeled Prometheus
//! series parsed out of `MetricsService::render()`'s full text, and a
//! realtime/push split read from the `notifications` table (see
//! `NotificationRepository::count_by_delivery`). Never returns the raw
//! metrics text to the caller (see `OverviewResponseDto`'s doc comment).
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `OverviewResponseDto`.
//! **Side effects:** None (reads only).
//! **Dependencies:** `services::PresenceService`, `services::MetricsService`,
//! `repositories::NotificationRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::OverviewResponseDto::OverviewResponseDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

/// Sums every sample of `metric_name` whose label set includes
/// `tenant_id="<tenant_id>"` — a minimal Prometheus text scan, sufficient
/// for the counter vectors `MetricsService` actually registers (not a
/// general-purpose parser; mirrors `admin/src/actions/system/getMetrics.action.ts`'s
/// approach on the frontend, moved server-side here so scoping happens
/// before the response ever leaves the server).
fn sum_metric_for_tenant(raw: &str, metric_name: &str, tenant_id: TenantId) -> u64 {
    let label = format!("tenant_id=\"{tenant_id}\"");
    raw.lines()
        .filter(|line| line.starts_with(metric_name) && !line.starts_with('#') && line.contains(&label))
        .filter_map(|line| line.rsplit(' ').next())
        .filter_map(|value| value.parse::<f64>().ok())
        .map(|value| value as u64)
        .sum()
}

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<OverviewResponseDto, PortalError> {
    let raw = ctx.metrics.render();
    let (realtime_messages_total, push_messages_total) = ctx.notifications.count_by_delivery(tenant_id).await?;

    Ok(OverviewResponseDto {
        tenant_id,
        active_sessions: ctx.presence.list_sessions(tenant_id).len(),
        messages_total: sum_metric_for_tenant(&raw, "realtime_engine_messages_total", tenant_id),
        rate_limited_total: sum_metric_for_tenant(&raw, "realtime_engine_rate_limited_total", tenant_id),
        realtime_messages_total,
        push_messages_total,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn sums_only_matching_tenant() {
        let tenant_a = Uuid::from_u128(1);
        let tenant_b = Uuid::from_u128(2);
        let raw = format!(
            "realtime_engine_messages_total{{opcode=\"PUB\",tenant_id=\"{tenant_a}\"}} 3\n\
             realtime_engine_messages_total{{opcode=\"SUB\",tenant_id=\"{tenant_a}\"}} 2\n\
             realtime_engine_messages_total{{opcode=\"PUB\",tenant_id=\"{tenant_b}\"}} 99\n"
        );
        assert_eq!(sum_metric_for_tenant(&raw, "realtime_engine_messages_total", tenant_a), 5);
    }
}
