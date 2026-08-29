//! # RevokeApiKeyUseCase
//!
//! **Action:** Revokes one API key pair, scoped to the caller's own
//! tenant — immediately fails `TokenService::validate` for any token
//! signed with it, without affecting the tenant's primary secret or any
//! other key pair (see `TokenService::issue_token_with_secret`'s doc
//! comment for why revocation is precise rather than all-or-nothing).
//! **Input:** `TenantId` (from the validated portal session), key `Uuid`.
//! **Output:** `()`.
//! **Side effects:** Marks the `api_keys` row revoked; removes it from
//! `TokenService`'s in-memory extra-key store; logs.
//! **Dependencies:** `services::TokenService`, `repositories::ApiKeyRepository`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId, key_id: Uuid) -> Result<(), PortalError> {
    let key = ctx
        .api_keys
        .find_by_id(tenant_id, key_id)
        .await?
        .ok_or(PortalError::ApiKeyNotFound)?;

    let revoked = ctx.api_keys.revoke(tenant_id, key_id).await?;
    if !revoked {
        return Err(PortalError::ApiKeyNotFound); // already revoked
    }

    ctx.token_service.revoke_extra_key(tenant_id, &key.public_key);

    tracing::info!(%tenant_id, public_key = %key.public_key, "API key pair revoked via the portal");
    Ok(())
}
