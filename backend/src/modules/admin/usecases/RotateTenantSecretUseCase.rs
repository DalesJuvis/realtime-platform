//! # RotateTenantSecretUseCase
//!
//! **Action:** Rotates (or generates) a tenant's HMAC secret.
//! **Input:** Tenant ID, `RotateSecretDto`.
//! **Output:** `TenantSecretResponseDto`.
//! **Side effects:** Overwrites the tenant's registered secret; logs.
//! **Dependencies:** `services::TokenService`.

use uuid::Uuid;

use crate::modules::admin::dto::RotateSecretDto::RotateSecretDto;
use crate::modules::admin::dto::TenantSecretResponseDto::TenantSecretResponseDto;
use crate::modules::admin::usecases::CreateTenantUseCase::generate_secret;
use crate::modules::admin::AdminContext::AdminContext;

pub fn execute(ctx: &AdminContext, tenant_id: Uuid, dto: RotateSecretDto) -> TenantSecretResponseDto {
    let secret = dto.secret.unwrap_or_else(generate_secret);
    // `register_tenant` upserts: calling this route on a non-existent
    // tenant is equivalent to creating it — a reasonable idempotent
    // behavior for a rotation route.
    ctx.auth.register_tenant(tenant_id, secret.clone().into_bytes());

    tracing::info!(%tenant_id, "secret rotated via the Admin API");
    TenantSecretResponseDto { tenant_id, secret }
}
