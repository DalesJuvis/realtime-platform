/**
 * # markNotificationReadAction / markAllNotificationsReadAction
 *
 * Action:   Marks one (or every) notification read for the caller's own
 *           tenant. Idempotent on the backend — safe to call on an
 *           already-read notification.
 * Endpoint: POST /api/v1/portal/notifications/:id/read
 *           POST /api/v1/portal/notifications/read-all
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export async function markNotificationReadAction(id: string): Promise<void> {
  await apiRequest(http.post<ApiResponse<Record<string, never>>>(`/api/v1/portal/notifications/${id}/read`))
}

export async function markAllNotificationsReadAction(): Promise<void> {
  await apiRequest(http.post<ApiResponse<Record<string, never>>>('/api/v1/portal/notifications/read-all'))
}
