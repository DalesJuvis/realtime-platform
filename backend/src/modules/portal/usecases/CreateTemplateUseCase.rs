//! # CreateTemplateUseCase
//!
//! **Action:** Saves a new message template for the caller's own tenant.
//! **Input:** `TenantId` (from the validated portal session), `SaveTemplateDto`.
//! **Output:** `TemplateResponseDto`.
//! **Dependencies:** `portal::repositories::MessageTemplateRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::TemplateDto::{SaveTemplateDto, TemplateResponseDto};
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(
    ctx: &PortalContext,
    tenant_id: TenantId,
    dto: SaveTemplateDto,
) -> Result<TemplateResponseDto, PortalError> {
    let template = ctx.templates.create(tenant_id, &dto.name, &dto.body).await?;
    Ok(TemplateResponseDto::from(template))
}
