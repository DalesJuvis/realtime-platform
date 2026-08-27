//! # DeleteTemplateUseCase
//!
//! **Action:** Deletes a message template, scoped to the caller's own tenant.
//! **Input:** `TenantId` (from the validated portal session), template `Uuid`.
//! **Output:** `()`.
//! **Dependencies:** `portal::repositories::MessageTemplateRepository`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId, id: Uuid) -> Result<(), PortalError> {
    let deleted = ctx.templates.delete(tenant_id, id).await?;
    if !deleted {
        return Err(PortalError::TemplateNotFound);
    }
    Ok(())
}
