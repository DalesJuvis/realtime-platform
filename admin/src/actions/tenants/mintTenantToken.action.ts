/**
 * # mintTenantTokenAction
 *
 * Action:   Mints a client (WS/TCP) token for an arbitrary `sub` on a given
 *           tenant — no tenant secret needed, the admin's own bearer token
 *           is already stronger proof of authority. Used by the Sandbox
 *           page to join a live session's channel(s) as an "agent" identity.
 * Endpoint: POST /api/v1/admin/tenants/:id/tokens
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { TenantId } from '@entities/Tenant.entity'

export async function mintTenantTokenAction(tenantId: TenantId, sub: string): Promise<string> {
  const response = await apiRequest(
    http.post<ApiResponse<{ token: string }>>(`/api/v1/admin/tenants/${tenantId}/tokens`, { sub }),
  )
  return response.token
}
