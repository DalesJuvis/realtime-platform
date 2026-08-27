//! # ListChannelsUseCase
//!
//! **Action:** The Channel Management page's data — every channel this
//! tenant currently has live state for, with its subscriber count.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `Vec<ChannelSummaryDto>`.
//! **Side effects:** None.
//! **Dependencies:** `services::ChannelRouterService`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::ChannelSummaryDto::ChannelSummaryDto;
use crate::modules::portal::PortalContext::PortalContext;

pub fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Vec<ChannelSummaryDto> {
    ctx.channel_router
        .list_channels(tenant_id)
        .into_iter()
        .map(|(channel_id, subscriber_count)| ChannelSummaryDto { channel_id, subscriber_count })
        .collect()
}
