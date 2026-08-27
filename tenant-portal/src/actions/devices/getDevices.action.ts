/**
 * # getDevicesAction
 *
 * Action:   Live connected sessions ("devices") for the signed-in tenant.
 * Endpoint: GET /api/v1/portal/sessions
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { Device } from '@entities/Device.entity'

export async function getDevicesAction(): Promise<Device[]> {
  return apiRequest(http.get<ApiResponse<Device[]>>('/api/v1/portal/sessions'))
}
