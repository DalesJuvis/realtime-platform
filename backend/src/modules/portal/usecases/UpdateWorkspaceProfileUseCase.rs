//! # UpdateWorkspaceProfileUseCase
//!
//! **Action:** Updates the caller's workspace name/website — either field
//! omitted leaves it unchanged.
//! **Input:** `TenantId` (from the validated portal session), `UpdateProfileDto`.
//! **Output:** `ProfileResponseDto`.
//! **Dependencies:** `portal::repositories::WorkspaceProfileRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::WorkspaceProfileDto::{ProfileResponseDto, UpdateProfileDto};
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId, dto: UpdateProfileDto) -> Result<ProfileResponseDto, PortalError> {
    ctx.workspace_profile
        .update(tenant_id, dto.name.as_deref(), dto.website_url.as_deref())
        .await?;
    let profile = ctx.workspace_profile.get(tenant_id).await?;
    Ok(ProfileResponseDto::from(profile))
}
