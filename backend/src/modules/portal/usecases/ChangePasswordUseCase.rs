//! # ChangePasswordUseCase
//!
//! **Action:** Changes the caller's own portal login password, after
//! verifying the current one.
//! **Input:** `TenantUserId` (from the validated portal session), `ChangePasswordDto`.
//! **Output:** `()`.
//! **Side effects:** Overwrites `tenant_users.password_hash`; logs.
//! **Dependencies:** `portal::services::PortalAuthService`,
//! `portal::repositories::TenantUserRepository`.

use crate::entities::TenantUser::TenantUserId;
use crate::modules::portal::dto::ChangePasswordDto::ChangePasswordDto;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

const MIN_PASSWORD_LEN: usize = 8;

pub async fn execute(ctx: &PortalContext, user_id: TenantUserId, dto: ChangePasswordDto) -> Result<(), PortalError> {
    if dto.new_password.len() < MIN_PASSWORD_LEN {
        return Err(PortalError::WeakPassword);
    }

    let user = ctx
        .tenant_users
        .find_by_id(user_id)
        .await?
        .ok_or(PortalError::InvalidCredentials)?;

    if !ctx.portal_auth.verify_password(&dto.current_password, &user.password_hash) {
        return Err(PortalError::InvalidCredentials);
    }

    let new_hash = ctx
        .portal_auth
        .hash_password(&dto.new_password)
        .map_err(|_| PortalError::InvalidCredentials)?;
    ctx.tenant_users.update_password_hash(user_id, &new_hash).await?;

    tracing::info!(%user_id, "portal password changed");
    Ok(())
}
