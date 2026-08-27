//! # UpdateTemplateUseCase
//!
//! **Action:** Overwrites an existing message template's name/body,
//! scoped to the caller's own tenant.
//! **Input:** `TenantId` (from the validated portal session), template
//! `Uuid`, `SaveTemplateDto`.
//! **Output:** `()` — the caller already has the new values.
//! **Dependencies:** `portal::repositories::MessageTemplateRepository`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::TemplateDto::SaveTemplateDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId, id: Uuid, dto: SaveTemplateDto) -> Result<(), PortalError> {
    let updated = ctx.templates.update(tenant_id, id, &dto.name, &dto.body).await?;
    if !updated {
        return Err(PortalError::TemplateNotFound);
    }
    Ok(())
}
