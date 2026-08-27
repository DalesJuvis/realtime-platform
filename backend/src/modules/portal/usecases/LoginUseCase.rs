//! # LoginUseCase
//!
//! **Action:** Authenticates a portal login and issues a session token.
//! **Input:** `LoginDto`.
//! **Output:** `SessionTokenResponseDto`.
//! **Side effects:** None beyond a read; logs.
//! **Dependencies:** `portal::services::PortalAuthService`, `portal::repositories::TenantUserRepository`.

const SESSION_TTL_SECS: u64 = 24 * 3600;

use crate::modules::portal::dto::LoginDto::LoginDto;
use crate::modules::portal::dto::SessionTokenResponseDto::SessionTokenResponseDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, dto: LoginDto) -> Result<SessionTokenResponseDto, PortalError> {
    let user = ctx
        .tenant_users
        .find_by_email(&dto.email)
        .await?
        .ok_or(PortalError::InvalidCredentials)?;

    if !ctx.portal_auth.verify_password(&dto.password, &user.password_hash) {
        return Err(PortalError::InvalidCredentials);
    }

    let token = ctx
        .portal_auth
        .issue_session(&user, SESSION_TTL_SECS)
        .map_err(|_| PortalError::InvalidCredentials)?;

    tracing::info!(tenant_id = %user.tenant_id, email = %user.email, "portal login");
    Ok(SessionTokenResponseDto::new(token, SESSION_TTL_SECS))
}
