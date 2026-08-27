/**
 * # revokeTenantAction
 *
 * Action:   Revokes a tenant — every subsequent client-token validation for
 *           it immediately fails with `UnknownTenant` (irreversible: there
 *           is no "restore", only creating it again with a new secret).
 * Input:    TenantId
 * Output:   void
 * Endpoint: DELETE /api/v1/admin/tenants/:id
 */

import { http, apiRequestVoid } from '@lib/http'
import type { TenantId } from '@entities/Tenant.entity'

export async function revokeTenantAction(tenantId: TenantId): Promise<void> {
  return apiRequestVoid(http.delete(`/api/v1/admin/tenants/${tenantId}`))
}
