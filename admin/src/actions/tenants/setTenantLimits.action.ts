/**
 * # setTenantLimitsAction
 *
 * Action:   Replaces a tenant's rate-limit quotas (token-bucket, session +
 *           tenant scope) — takes effect immediately, no restart needed.
 * Input:    TenantId, RateLimitConfig
 * Output:   void
 * Endpoint: PUT /api/v1/admin/tenants/:id/limits
 */

import { http, apiRequestVoid } from '@lib/http'
import type { RateLimitConfig, TenantId } from '@entities/Tenant.entity'

export async function setTenantLimitsAction(tenantId: TenantId, limits: RateLimitConfig): Promise<void> {
  return apiRequestVoid(http.put(`/api/v1/admin/tenants/${tenantId}/limits`, limits))
}
