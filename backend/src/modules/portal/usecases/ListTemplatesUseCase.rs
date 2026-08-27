//! # ListTemplatesUseCase
//!
//! **Action:** The Templating page's list — every saved message template
//! for the caller's own tenant, most recently updated first.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `Vec<TemplateResponseDto>`.
//! **Dependencies:** `portal::repositories::MessageTemplateRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::TemplateDto::TemplateResponseDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<Vec<TemplateResponseDto>, PortalError> {
    let templates = ctx.templates.list_for_tenant(tenant_id).await?;
    Ok(templates.into_iter().map(TemplateResponseDto::from).collect())
}
