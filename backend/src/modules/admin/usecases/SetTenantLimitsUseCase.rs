//! # SetTenantLimitsUseCase
//!
//! **Action:** Applies rate-limit quotas to a specific tenant.
//! **Input:** Tenant ID, `RateLimitConfig`.
//! **Output:** None.
//! **Side effects:** Overwrites the tenant's rate-limit override; logs.
//! **Dependencies:** `services::RateLimitService`.

use uuid::Uuid;

use crate::entities::RateLimitConfig::RateLimitConfig;
use crate::modules::admin::AdminContext::AdminContext;

pub fn execute(ctx: &AdminContext, tenant_id: Uuid, limits: RateLimitConfig) {
    ctx.rate_limiter.set_tenant_limits(tenant_id, limits);
    tracing::info!(%tenant_id, "quotas updated via the Admin API");
}
