/**
 * # sendTestPushAction
 *
 * Action:   Sends a real Web Push notification straight to one device
 *           from the Settings device list — bypasses channel matching
 *           entirely, unlike a normal broadcast.
 * Endpoint: POST /api/v1/portal/push-subscriptions/test
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export async function sendTestPushAction(endpoint: string): Promise<void> {
  await apiRequest(
    http.post<ApiResponse<Record<string, never>>>('/api/v1/portal/push-subscriptions/test', { endpoint }),
  )
}
