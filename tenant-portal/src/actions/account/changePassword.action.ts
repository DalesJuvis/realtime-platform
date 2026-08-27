/**
 * # changePasswordAction
 *
 * Action:   Changes the signed-in user's password, after verifying the
 *           current one server-side.
 * Endpoint: PUT /api/v1/portal/account/password
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export async function changePasswordAction(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest(
    http.put<ApiResponse<Record<string, never>>>('/api/v1/portal/account/password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  )
}
