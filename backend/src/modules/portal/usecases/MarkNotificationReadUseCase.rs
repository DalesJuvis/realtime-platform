//! # MarkNotificationReadUseCase
//!
//! **Action:** Marks one notification read, scoped to the caller's own
//! tenant.
//! **Input:** `TenantId` (from the validated portal session), notification id.
//! **Output:** `()`.
//! **Dependencies:** `portal::repositories::NotificationRepository`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId, id: Uuid) -> Result<(), PortalError> {
    ctx.notifications.mark_read(tenant_id, id).await?;
    Ok(())
}
