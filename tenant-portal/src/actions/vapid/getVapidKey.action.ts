/**
 * # getVapidKeyAction
 *
 * Action:   Reads the VAPID public key configured for this backend
 *           instance — `null` when Web Push isn't set up here at all.
 *           Not tenant-scoped data (every tenant on this instance shares
 *           the same keypair), but still only reachable with a portal
 *           session — see `VapidKeyDto`'s doc comment.
 * Endpoint: GET /api/v1/portal/vapid-key
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

interface VapidKeyResponse {
  readonly vapid_public_key: string | null
}

export async function getVapidKeyAction(): Promise<string | null> {
  const response = await apiRequest(http.get<ApiResponse<VapidKeyResponse>>('/api/v1/portal/vapid-key'))
  return response.vapid_public_key
}
