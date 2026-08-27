/**
 * # updateTemplateAction
 *
 * Action:   Overwrites an existing message template's name/body.
 * Endpoint: PUT /api/v1/portal/templates/:id
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { SaveTemplateDto } from './createTemplate.action'

export async function updateTemplateAction(id: string, dto: SaveTemplateDto): Promise<void> {
  await apiRequest(http.put<ApiResponse<Record<string, never>>>(`/api/v1/portal/templates/${id}`, dto))
}
