//! # RegisterTenantUserUseCase
//!
//! **Action:** Creates a portal login account for a tenant, proving
//! ownership by requiring the tenant's real HMAC secret.
//! **Input:** `RegisterDto`.
//! **Output:** `SessionTokenResponseDto` (logs the new user straight in).
//! **Side effects:** Inserts a `tenant_users` row; logs.
//! **Dependencies:** `services::TokenService`, `portal::services::PortalAuthService`, `portal::repositories::TenantUserRepository`.

const SESSION_TTL_SECS: u64 = 24 * 3600;

use crate::modules::portal::dto::RegisterDto::RegisterDto;
use crate::modules::portal::dto::SessionTokenResponseDto::SessionTokenResponseDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, dto: RegisterDto) -> Result<SessionTokenResponseDto, PortalError> {
    if !ctx.token_service.verify_tenant_secret(dto.tenant_id, dto.secret.as_bytes()) {
        return Err(PortalError::InvalidTenantSecret);
    }

    if ctx.tenant_users.email_exists(&dto.email).await? {
        return Err(PortalError::EmailAlreadyRegistered);
    }

    let password_hash = ctx
        .portal_auth
        .hash_password(&dto.password)
        .map_err(|_| PortalError::InvalidCredentials)?;

    let user = ctx
        .tenant_users
        .create(dto.tenant_id, &dto.email, &password_hash)
        .await?;

    let token = ctx
        .portal_auth
        .issue_session(&user, SESSION_TTL_SECS)
        .map_err(|_| PortalError::InvalidCredentials)?;

    tracing::info!(tenant_id = %dto.tenant_id, email = %user.email, "portal account registered");
    Ok(SessionTokenResponseDto::new(token, SESSION_TTL_SECS))
}
