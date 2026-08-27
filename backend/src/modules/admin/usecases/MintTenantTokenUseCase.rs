//! # MintTenantTokenUseCase
//!
//! **Action:** Mints a client (WS/TCP) token for a given tenant + `sub`,
//! authorized by the platform admin's own authority — no tenant secret
//! needed. Used by the Sandbox page to join a live session's channel(s)
//! as an observing/participating "agent" identity.
//! **Input:** `TenantId` (path param), `AdminMintTokenDto`.
//! **Output:** `ClientTokenResponseDto`.
//! **Side effects:** None; logs.
//! **Dependencies:** `services::TokenService`.

const DEFAULT_TTL_SECS: u64 = 3600;

use crate::entities::ChannelKey::TenantId;
use crate::modules::admin::dto::MintTokenDto::{AdminMintTokenDto, ClientTokenResponseDto};
use crate::modules::admin::AdminContext::AdminContext;
use crate::modules::auth::services::TokenService::AuthError;

pub fn execute(
    ctx: &AdminContext,
    tenant_id: TenantId,
    dto: AdminMintTokenDto,
) -> Result<ClientTokenResponseDto, AuthError> {
    let ttl = dto.ttl_secs.unwrap_or(DEFAULT_TTL_SECS);
    let token = ctx.auth.issue_token(tenant_id, &dto.sub, ttl)?;

    tracing::info!(%tenant_id, sub = %dto.sub, "client token minted via the admin sandbox");
    Ok(ClientTokenResponseDto { token })
}
