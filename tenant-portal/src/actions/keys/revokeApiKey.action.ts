/**
 * # revokeApiKeyAction
 *
 * Action:   Revokes one API key pair — immediately stops it minting or
 *           validating tokens, without affecting the tenant's primary
 *           secret or any other key pair.
 * Endpoint: DELETE /api/v1/portal/api-keys/:id
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export async function revokeApiKeyAction(id: string): Promise<void> {
  await apiRequest(http.delete<ApiResponse<Record<string, never>>>(`/api/v1/portal/api-keys/${id}`))
}
