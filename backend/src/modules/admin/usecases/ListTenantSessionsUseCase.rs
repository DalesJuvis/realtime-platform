//! # ListTenantSessionsUseCase
//!
//! **Action:** The Sandbox page's session list — every live WS/TCP
//! connection currently open for a given tenant, platform-wide (unlike the
//! portal's own version, `tenant_id` here is a caller-supplied path param,
//! not derived from a session — this endpoint is for the platform admin
//! looking across tenants, not a tenant looking at itself).
//! **Input:** `TenantId` (path param).
//! **Output:** `Vec<SessionSummaryDto>`.
//! **Dependencies:** `services::PresenceService`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::admin::dto::SessionSummaryDto::SessionSummaryDto;
use crate::modules::admin::AdminContext::AdminContext;

pub fn execute(ctx: &AdminContext, tenant_id: TenantId) -> Vec<SessionSummaryDto> {
    ctx.presence.list_sessions(tenant_id).into_iter().map(SessionSummaryDto::from).collect()
}
