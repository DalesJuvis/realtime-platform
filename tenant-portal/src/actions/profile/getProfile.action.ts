/**
 * # getProfileAction
 *
 * Action:   Reads the signed-in tenant's workspace profile.
 * Endpoint: GET /api/v1/portal/profile
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { WorkspaceProfile } from '@entities/WorkspaceProfile.entity'

export async function getProfileAction(): Promise<WorkspaceProfile> {
  return apiRequest(http.get<ApiResponse<WorkspaceProfile>>('/api/v1/portal/profile'))
}
