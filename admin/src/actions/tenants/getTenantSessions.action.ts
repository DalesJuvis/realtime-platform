/**
 * # getTenantSessionsAction
 *
 * Action:   Live WS/TCP sessions currently open for a given tenant — the
 *           Sandbox page's session list.
 * Endpoint: GET /api/v1/admin/tenants/:id/sessions
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { Session } from '@entities/Session.entity'
import type { TenantId } from '@entities/Tenant.entity'

export async function getTenantSessionsAction(tenantId: TenantId): Promise<Session[]> {
  return apiRequest(http.get<ApiResponse<Session[]>>(`/api/v1/admin/tenants/${tenantId}/sessions`))
}
