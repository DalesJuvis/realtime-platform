//! # CreateTenantUseCase
//!
//! **Action:** Creates a tenant, generating an ID/secret when omitted, and
//! optionally applies custom rate-limit quotas.
//! **Input:** `CreateTenantDto`.
//! **Output:** `TenantSecretResponseDto`.
//! **Side effects:** Registers the tenant's HMAC secret; optionally sets its rate-limit quotas; logs.
//! **Dependencies:** `services::TokenService`, `services::RateLimitService`.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use uuid::Uuid;

use crate::modules::admin::dto::CreateTenantDto::CreateTenantDto;
use crate::modules::admin::dto::TenantSecretResponseDto::TenantSecretResponseDto;
use crate::modules::admin::AdminContext::AdminContext;

/// Generates a random 256-bit secret, base64url-encoded, for tenants
/// created/rotated without an explicit caller-provided secret.
pub fn generate_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn execute(ctx: &AdminContext, dto: CreateTenantDto) -> TenantSecretResponseDto {
    let tenant_id = dto.tenant_id.unwrap_or_else(Uuid::new_v4);
    let secret = dto.secret.unwrap_or_else(generate_secret);

    ctx.auth.register_tenant(tenant_id, secret.clone().into_bytes());
    if let Some(limits) = dto.limits {
        ctx.rate_limiter.set_tenant_limits(tenant_id, limits);
    }

    tracing::info!(%tenant_id, "tenant created via the Admin API");
    TenantSecretResponseDto { tenant_id, secret }
}
