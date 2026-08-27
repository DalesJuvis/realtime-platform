//! # GetWorkspaceProfileUseCase
//!
//! **Action:** Reads the caller's workspace profile for the Settings →
//! Profile tab.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `ProfileResponseDto`.
//! **Dependencies:** `portal::repositories::WorkspaceProfileRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::WorkspaceProfileDto::ProfileResponseDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<ProfileResponseDto, PortalError> {
    let profile = ctx.workspace_profile.get(tenant_id).await?;
    Ok(ProfileResponseDto::from(profile))
}
