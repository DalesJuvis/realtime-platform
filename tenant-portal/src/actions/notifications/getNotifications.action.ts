/**
 * # getNotificationsAction
 *
 * Action:   Reads the caller's own tenant's notification feed (most
 *           recent first) plus how many are unread — one call backs both
 *           the bell's dropdown and its badge count.
 * Endpoint: GET /api/v1/portal/notifications
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { NotificationList } from '@entities/Notification.entity'

export async function getNotificationsAction(): Promise<NotificationList> {
  return apiRequest(http.get<ApiResponse<NotificationList>>('/api/v1/portal/notifications'))
}
