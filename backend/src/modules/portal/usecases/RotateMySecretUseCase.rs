//! # RotateMySecretUseCase
//!
//! **Action:** Self-serve secret rotation, scoped to the caller's own
//! tenant (from the validated portal session) — the Portal API's
//! equivalent of the Admin API's `RotateTenantSecretUseCase`, but callable
//! by the tenant themselves, no static admin token needed.
//! **Input:** `TenantId` (from the validated portal session).
//! **Output:** `KeyPairDto` — the new secret, shown once like at signup.
//! **Side effects:** Overwrites the tenant's registered secret in
//! `TokenService` and its durable copy in `tenant_secrets`; logs.
//!
//! Every currently-issued client token for this tenant keeps validating
//! until it expires (`TokenService::validate` only checks the token's own
//! signature and expiry, not "is this the current secret") — rotation
//! stops *future* mint/validate calls from trusting the old secret, it
//! does not revoke tokens already handed out.

use crate::entities::ChannelKey::TenantId;
use crate::modules::auth::services::TokenService::generate_secret;
use crate::modules::portal::dto::KeyPairDto::KeyPairDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId) -> Result<KeyPairDto, PortalError> {
    let secret = generate_secret();
    ctx.token_service.register_tenant(tenant_id, secret.clone().into_bytes());
    ctx.tenant_secrets.upsert(tenant_id, &secret).await?;

    tracing::info!(%tenant_id, "secret rotated via the portal");
    Ok(KeyPairDto { tenant_id, secret_key: secret })
}
