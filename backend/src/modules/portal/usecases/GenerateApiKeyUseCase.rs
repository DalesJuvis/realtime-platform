//! # GenerateApiKeyUseCase
//!
//! **Action:** Generates a new, named, independently-revocable API key
//! pair for the caller's own tenant — additive, never touches the
//! tenant's primary secret.
//! **Input:** `TenantId` (from the validated portal session), `CreateApiKeyDto`.
//! **Output:** `GeneratedApiKeyDto` — the secret, shown once, like at signup.
//! **Side effects:** Inserts an `api_keys` row; registers the key with
//! `TokenService`'s in-memory extra-key store (the request-hot-path copy
//! `validate`/`verify_tenant_secret` actually read from — durable write
//! first here, unlike `SignupTenantUseCase`, since a duplicate `public_key`
//! collision is a real (if unlikely) possibility worth catching before
//! the key becomes live); logs.
//! **Dependencies:** `services::TokenService`, `repositories::ApiKeyRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::auth::services::TokenService::{generate_public_key, generate_secret};
use crate::modules::portal::dto::ApiKeyDto::{CreateApiKeyDto, GeneratedApiKeyDto};
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(
    ctx: &PortalContext,
    tenant_id: TenantId,
    dto: CreateApiKeyDto,
) -> Result<GeneratedApiKeyDto, PortalError> {
    let name = dto.name.trim();
    if name.is_empty() {
        return Err(PortalError::ApiKeyNameRequired);
    }

    let public_key = generate_public_key();
    let secret = generate_secret();

    let key = ctx.api_keys.create(tenant_id, name, &public_key, &secret).await?;
    ctx.token_service
        .add_extra_key(tenant_id, &key.public_key, key.secret.clone().into_bytes());

    tracing::info!(%tenant_id, public_key = %key.public_key, name = %key.name, "API key pair generated via the portal");
    Ok(key.into())
}
