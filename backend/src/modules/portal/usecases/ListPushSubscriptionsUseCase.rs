//! # ListPushSubscriptionsUseCase
//!
//! **Action:** The tenant-portal device list — every browser/device
//! currently subscribed to Web Push for the caller's own tenant, most
//! recently registered first.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `Vec<PushSubscriptionSummaryResponseDto>`.
//! **Dependencies:** `realtime::repositories::PushSubscriptionRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::PushSubscriptionSummaryDto::PushSubscriptionSummaryResponseDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<Vec<PushSubscriptionSummaryResponseDto>, PortalError> {
    let devices = ctx.push_subscriptions.list_for_tenant(tenant_id).await?;
    Ok(devices.into_iter().map(Into::into).collect())
}
