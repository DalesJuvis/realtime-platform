//! # MintClientTokenUseCase
//!
//! **Action:** Mints a client (WS/TCP) token for the caller's own tenant —
//! server-side, so the tenant's raw HMAC secret never needs to be pasted
//! into a browser again after registration.
//! **Input:** `TenantId` (from the validated portal session), `MintTokenDto`.
//! **Output:** `ClientTokenResponseDto`.
//! **Side effects:** None; logs.
//! **Dependencies:** `services::TokenService`.

const DEFAULT_TTL_SECS: u64 = 3600;
// Caps a caller-supplied `ttl_secs` rather than rejecting it — the portal
// UI's own TTL picker never asks for more than this, so this only ever
// bites a direct API call, and clamping (not erroring) keeps a slightly
// too-generous request working instead of failing outright. 30 days: long
// enough for a "mint once, paste into a static site, forget about it"
// embed, short enough that a leaked token doesn't stay valid indefinitely.
const MAX_TTL_SECS: u64 = 30 * 24 * 3600;

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::MintTokenDto::{ClientTokenResponseDto, MintTokenDto};
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub fn execute(
    ctx: &PortalContext,
    tenant_id: TenantId,
    dto: MintTokenDto,
    ws_url: String,
) -> Result<ClientTokenResponseDto, PortalError> {
    let ttl = dto.ttl_secs.unwrap_or(DEFAULT_TTL_SECS).min(MAX_TTL_SECS);
    let token = ctx
        .token_service
        .issue_token(tenant_id, &dto.sub, ttl)
        .map_err(|_| PortalError::InvalidTenantSecret)?;

    tracing::info!(%tenant_id, sub = %dto.sub, "client token minted via the portal");
    Ok(ClientTokenResponseDto { token, expires_in: ttl, ws_url })
}
