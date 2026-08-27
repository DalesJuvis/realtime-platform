/**
 * # rotateTenantSecretAction
 *
 * Action:   Replaces a tenant's secret — every client token signed with the
 *           old secret stops validating immediately.
 * Input:    TenantId, an explicit new secret (optional — server generates
 *           a random one if omitted)
 * Output:   TenantSecretResponse — shown once, same as create.
 * Endpoint: PUT /api/v1/admin/tenants/:id/secret
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { TenantId, TenantSecretResponse } from '@entities/Tenant.entity'

export async function rotateTenantSecretAction(tenantId: TenantId, secret?: string): Promise<TenantSecretResponse> {
  return apiRequest(
    http.put<ApiResponse<TenantSecretResponse>>(`/api/v1/admin/tenants/${tenantId}/secret`, { secret }),
  )
}
