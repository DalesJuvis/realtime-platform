//! # ListSessionsUseCase
//!
//! **Action:** The portal's "devices" (live connected sessions) view —
//! every WS/TCP connection currently open for the caller's tenant.
//! **Input:** `TenantId` (from the validated portal session, never a caller-supplied param).
//! **Output:** `Vec<SessionSummaryDto>`.
//! **Side effects:** None.
//! **Dependencies:** `services::PresenceService`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::SessionSummaryDto::SessionSummaryDto;
use crate::modules::portal::PortalContext::PortalContext;

pub fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Vec<SessionSummaryDto> {
    ctx.presence
        .list_sessions(tenant_id)
        .into_iter()
        .map(SessionSummaryDto::from)
        .collect()
}
