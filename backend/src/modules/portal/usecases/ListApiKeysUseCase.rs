//! # ListApiKeysUseCase
//!
//! **Action:** Lists every API key pair the caller's own tenant has ever
//! generated, active or revoked.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `Vec<ApiKeyDto>` — never carries `secret` (see
//! `ApiKeyDto`'s own doc comment for why that's a separate type).
//! **Dependencies:** `repositories::ApiKeyRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::ApiKeyDto::ApiKeyDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<Vec<ApiKeyDto>, PortalError> {
    let keys = ctx.api_keys.list_for_tenant(tenant_id).await?;
    Ok(keys.iter().map(ApiKeyDto::from).collect())
}
