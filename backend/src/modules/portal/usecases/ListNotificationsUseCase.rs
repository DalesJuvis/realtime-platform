//! # ListNotificationsUseCase
//!
//! **Action:** The notification bell's feed — the caller's own tenant's
//! most recent received messages, plus how many are unread.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `NotificationListResponseDto`.
//! **Dependencies:** `portal::repositories::NotificationRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::NotificationDto::NotificationListResponseDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

/// The bell shows a feed, not a full archive — capped so a long-lived
/// tenant's table growing unbounded never makes this call slow.
const FEED_LIMIT: i64 = 100;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<NotificationListResponseDto, PortalError> {
    let items = ctx.notifications.list_for_tenant(tenant_id, FEED_LIMIT).await?;
    let unread_count = ctx.notifications.unread_count(tenant_id).await?;
    Ok(NotificationListResponseDto {
        items: items.into_iter().map(Into::into).collect(),
        unread_count,
    })
}
