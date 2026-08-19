//! # RevokeTenantUseCase
//!
//! **Action:** Revokes a tenant's authentication and clears its rate-limit overrides.
//! **Input:** Tenant ID.
//! **Output:** None.
//! **Side effects:** Removes the tenant's secret and quota override; logs.
//! **Dependencies:** `services::TokenService`, `services::RateLimitService`.

use uuid::Uuid;

use crate::modules::admin::AdminContext::AdminContext;

pub fn execute(ctx: &AdminContext, tenant_id: Uuid) {
    // Revokes both authentication AND tenant-specific quotas: a revoked
    // tenant must leave no active configuration behind.
    ctx.auth.revoke_tenant(tenant_id);
    ctx.rate_limiter.clear_tenant_limits(tenant_id);
    tracing::info!(%tenant_id, "tenant revoked via the Admin API");
}
