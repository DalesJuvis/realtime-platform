/**
 * # getPushSubscriptionsAction
 *
 * Action:   Lists every device currently subscribed to Web Push for the
 *           caller's own tenant — the Settings device list's data source.
 * Endpoint: GET /api/v1/portal/push-subscriptions
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { PushSubscriptionSummary } from '@entities/PushSubscriptionSummary.entity'

export async function getPushSubscriptionsAction(): Promise<PushSubscriptionSummary[]> {
  return apiRequest(http.get<ApiResponse<PushSubscriptionSummary[]>>('/api/v1/portal/push-subscriptions'))
}
