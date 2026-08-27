/**
 * # createTemplateAction
 *
 * Action:   Saves a new message template.
 * Endpoint: POST /api/v1/portal/templates
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { Template } from '@entities/Template.entity'

export interface SaveTemplateDto {
  readonly name: string
  readonly body: string
}

export async function createTemplateAction(dto: SaveTemplateDto): Promise<Template> {
  return apiRequest(http.post<ApiResponse<Template>>('/api/v1/portal/templates', dto))
}
