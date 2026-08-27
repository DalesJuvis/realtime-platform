/**
 * # getOverviewAction
 *
 * Action:   Tenant-scoped activity summary for the signed-in tenant.
 * Endpoint: GET /api/v1/portal/overview
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { Overview } from '@entities/Overview.entity'

export async function getOverviewAction(): Promise<Overview> {
  return apiRequest(http.get<ApiResponse<Overview>>('/api/v1/portal/overview'))
}
