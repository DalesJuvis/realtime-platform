/**
 * # uploadLogoAction
 *
 * Action:   Uploads a workspace logo — reads the file client-side into a
 *           `data:` URI (no multipart parsing needed server-side) and
 *           sends that; the backend re-validates MIME type and size
 *           regardless of what the browser's `accept=""` already filtered.
 * Endpoint: PUT /api/v1/portal/profile/logo
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { WorkspaceProfile } from '@entities/WorkspaceProfile.entity'

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsDataURL(file)
  })
}

export async function uploadLogoAction(file: File): Promise<WorkspaceProfile> {
  const dataUri = await readAsDataUri(file)
  return apiRequest(http.put<ApiResponse<WorkspaceProfile>>('/api/v1/portal/profile/logo', { data_uri: dataUri }))
}
