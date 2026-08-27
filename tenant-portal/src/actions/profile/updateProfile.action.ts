/**
 * # updateProfileAction
 *
 * Action:   Updates the workspace name and/or website — `null` leaves a
 *           field unchanged (matches the backend's partial-update semantics).
 * Endpoint: PUT /api/v1/portal/profile
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { WorkspaceProfile } from '@entities/WorkspaceProfile.entity'

export interface UpdateProfileDto {
  readonly name?: string | null
  readonly website_url?: string | null
}

export async function updateProfileAction(dto: UpdateProfileDto): Promise<WorkspaceProfile> {
  return apiRequest(http.put<ApiResponse<WorkspaceProfile>>('/api/v1/portal/profile', dto))
}
