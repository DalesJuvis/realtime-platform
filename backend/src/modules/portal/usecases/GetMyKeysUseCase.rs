//! # GetMyKeysUseCase
//!
//! **Action:** Reads the caller's current key pair for the Settings page.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `KeyPairDto`.
//! **Side effects:** None.
//! **Dependencies:** `portal::repositories::TenantSecretStoreRepository`.
//!
//! Returns `KeyPairNotFound` for a tenant that joined via the legacy
//! `RegisterTenantUserUseCase` flow (admin-provisioned secret, never
//! written to `tenant_secrets`) — rotating once self-heals this.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::KeyPairDto::KeyPairDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<KeyPairDto, PortalError> {
    let secret = ctx
        .tenant_secrets
        .get(tenant_id)
        .await?
        .ok_or(PortalError::KeyPairNotFound)?;
    Ok(KeyPairDto { tenant_id, secret_key: secret })
}
