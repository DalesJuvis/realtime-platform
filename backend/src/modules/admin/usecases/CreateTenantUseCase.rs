//! # CreateTenantUseCase
//!
//! **Action:** Creates a tenant, generating an ID/secret when omitted, and
//! optionally applies custom rate-limit quotas.
//! **Input:** `CreateTenantDto`.
//! **Output:** `TenantSecretResponseDto`.
//! **Side effects:** Registers the tenant's HMAC secret; optionally sets its rate-limit quotas; logs.
//! **Dependencies:** `services::TokenService`, `services::RateLimitService`.

use uuid::Uuid;

use crate::modules::admin::dto::CreateTenantDto::CreateTenantDto;
use crate::modules::admin::dto::TenantSecretResponseDto::TenantSecretResponseDto;
use crate::modules::admin::AdminContext::AdminContext;
// Re-exported so `RotateTenantSecretUseCase`'s existing
// `use ...::CreateTenantUseCase::generate_secret;` keeps working — the
// generator itself now lives in `TokenService`, shared with the Portal
// API's self-serve signup/key-rotation.
pub use crate::modules::auth::services::TokenService::generate_secret;

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
