//! # SignupTenantUseCase
//!
//! **Action:** Self-serve "create account": creates a brand-new tenant, a
//! fresh key pair, and a portal login account in one step — unlike
//! `RegisterTenantUserUseCase`, which requires proving ownership of a
//! tenant an admin already provisioned, this one needs nothing but an
//! email/password because there is no existing tenant to prove ownership of.
//! **Input:** `SignupDto`.
//! **Output:** `SignupResponseDto`.
//! **Side effects:** Registers a new tenant secret in `TokenService`;
//! inserts `tenant_secrets` and `tenant_users` rows; logs.
//! **Dependencies:** `services::TokenService`, `portal::services::PortalAuthService`,
//! `portal::repositories::{TenantUserRepository, TenantSecretStoreRepository}`.

use uuid::Uuid;

use crate::modules::auth::services::TokenService::generate_secret;
use crate::modules::portal::dto::KeyPairDto::KeyPairDto;
use crate::modules::portal::dto::SignupDto::SignupDto;
use crate::modules::portal::dto::SignupResponseDto::SignupResponseDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

const SESSION_TTL_SECS: u64 = 24 * 3600;

pub async fn execute(ctx: &PortalContext, dto: SignupDto) -> Result<SignupResponseDto, PortalError> {
    if ctx.tenant_users.email_exists(&dto.email).await? {
        return Err(PortalError::EmailAlreadyRegistered);
    }

    let tenant_id = Uuid::new_v4();
    let secret = generate_secret();
    // Register in-memory first (the request-hot-path store `validate()`
    // actually reads from), then persist durably — if the durable write
    // fails, the tenant can still self-heal via a later key rotation.
    ctx.token_service.register_tenant(tenant_id, secret.clone().into_bytes());
    ctx.tenant_secrets.upsert(tenant_id, &secret).await?;

    let password_hash = ctx
        .portal_auth
        .hash_password(&dto.password)
        .map_err(|_| PortalError::InvalidCredentials)?;
    let user = ctx.tenant_users.create(tenant_id, &dto.email, &password_hash).await?;
    let token = ctx
        .portal_auth
        .issue_session(&user, SESSION_TTL_SECS)
        .map_err(|_| PortalError::InvalidCredentials)?;

    tracing::info!(%tenant_id, email = %user.email, "self-serve tenant signup");
    Ok(SignupResponseDto {
        access_token: token,
        token_type: "Bearer",
        expires_in: SESSION_TTL_SECS,
        keys: KeyPairDto { tenant_id, secret_key: secret },
    })
}
