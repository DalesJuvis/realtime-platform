/**
 * # revokePushSubscriptionAction
 *
 * Action:   Removes one device's Web Push subscription from the caller's
 *           own tenant — lets a tenant admin revoke any of their devices
 *           from the Settings device list, not just the current browser
 *           (that's `unregisterPortalPushAction`'s job instead).
 * Endpoint: DELETE /api/v1/portal/push-subscriptions
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export async function revokePushSubscriptionAction(endpoint: string): Promise<void> {
  await apiRequest(
    http.delete<ApiResponse<Record<string, never>>>('/api/v1/portal/push-subscriptions', { data: { endpoint } }),
  )
}
