/**
 * # sendBroadcastAction
 *
 * Action:   Publishes a message to a channel of the signed-in tenant,
 *           through the already-proven portal session — no separate
 *           client-token mint step needed. One frame's worth of payload
 *           (211 UTF-8 bytes), no chunking: split larger messages into
 *           multiple sends.
 * Endpoint: POST /api/v1/portal/broadcast
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export interface BroadcastDto {
  readonly channelId: string
  readonly payload: string
}

export async function sendBroadcastAction(dto: BroadcastDto): Promise<void> {
  await apiRequest(
    http.post<ApiResponse<{ published: boolean }>>('/api/v1/portal/broadcast', {
      channel_id: dto.channelId,
      payload: dto.payload,
    }),
  )
}
