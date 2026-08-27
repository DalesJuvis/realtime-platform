//! # IssueClientTokenUseCase
//!
//! **Action:** Mints a client (WS/TCP) token after verifying the caller
//! actually holds this tenant's secret — the HTTP authentication step
//! that happens *before* a realtime connection, so end-user apps never
//! need to embed the raw tenant secret or reimplement its HMAC signing.
//! **Input:** `IssueTokenDto`.
//! **Output:** `TokenResponseDto`.
//! **Side effects:** None; logs.
//! **Dependencies:** `services::TokenService`.

use crate::modules::auth::dto::IssueTokenDto::{IssueTokenDto, TokenResponseDto};
use crate::modules::auth::services::TokenService::TokenService;

const DEFAULT_TTL_SECS: u64 = 3600;

#[derive(Debug, thiserror::Error)]
pub enum IssueTokenError {
    #[error("tenant_id/secret pair does not match a registered tenant")]
    InvalidTenantSecret,
}

pub fn execute(token_service: &TokenService, dto: IssueTokenDto) -> Result<TokenResponseDto, IssueTokenError> {
    if !token_service.verify_tenant_secret(dto.tenant_id, dto.secret.as_bytes()) {
        return Err(IssueTokenError::InvalidTenantSecret);
    }

    let ttl = dto.ttl_secs.unwrap_or(DEFAULT_TTL_SECS);
    let token = token_service
        .issue_token(dto.tenant_id, &dto.sub, ttl)
        .map_err(|_| IssueTokenError::InvalidTenantSecret)?;

    tracing::info!(tenant_id = %dto.tenant_id, sub = %dto.sub, "client token issued via the public HTTP auth endpoint");
    Ok(TokenResponseDto { token, expires_in: ttl })
}
