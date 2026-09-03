//! # MarkAllNotificationsReadUseCase
//!
//! **Action:** Marks every unread notification read for the caller's own
//! tenant — the bell's "mark all as read" action.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `()`.
//! **Dependencies:** `portal::repositories::NotificationRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<(), PortalError> {
    ctx.notifications.mark_all_read(tenant_id).await?;
    Ok(())
}
