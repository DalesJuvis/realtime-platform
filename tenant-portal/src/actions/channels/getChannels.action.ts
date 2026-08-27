/**
 * # getChannelsAction
 *
 * Action:   Every channel the signed-in tenant currently has live state
 *           for, with its subscriber count.
 * Endpoint: GET /api/v1/portal/channels
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { Channel } from '@entities/Channel.entity'

export async function getChannelsAction(): Promise<Channel[]> {
  return apiRequest(http.get<ApiResponse<Channel[]>>('/api/v1/portal/channels'))
}
