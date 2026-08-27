/**
 * # deleteTemplateAction
 *
 * Action:   Deletes a message template.
 * Endpoint: DELETE /api/v1/portal/templates/:id
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export async function deleteTemplateAction(id: string): Promise<void> {
  await apiRequest(http.delete<ApiResponse<Record<string, never>>>(`/api/v1/portal/templates/${id}`))
}
