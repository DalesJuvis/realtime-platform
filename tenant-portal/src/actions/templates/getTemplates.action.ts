/**
 * # getTemplatesAction
 *
 * Action:   Every saved message template for the signed-in tenant.
 * Endpoint: GET /api/v1/portal/templates
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { Template } from '@entities/Template.entity'

export async function getTemplatesAction(): Promise<Template[]> {
  return apiRequest(http.get<ApiResponse<Template[]>>('/api/v1/portal/templates'))
}
