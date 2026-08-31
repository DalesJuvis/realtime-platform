/**
 * # mintTokenAction
 *
 * Action:   Mints a client (WS/TCP) token for the signed-in tenant,
 *           server-side — the tenant's raw HMAC secret never has to be
 *           pasted into a browser again after registration.
 * Endpoint: POST /api/v1/portal/tokens
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export interface MintTokenDto {
  readonly sub: string
  readonly ttlSecs?: number
}

export interface MintedToken {
  readonly token: string
  readonly expiresIn: number
  /** Server-derived `ws://`/`wss://.../ws` URL — see `WsUrlService::derive_ws_url`
   * on the backend. Never assembled client-side (host/port/secure). */
  readonly wsUrl: string
}

export async function mintTokenAction(dto: MintTokenDto): Promise<MintedToken> {
  const response = await apiRequest(
    http.post<ApiResponse<{ token: string; expires_in: number; ws_url: string }>>('/api/v1/portal/tokens', {
      sub: dto.sub,
      ttl_secs: dto.ttlSecs,
    }),
  )
  return { token: response.token, expiresIn: response.expires_in, wsUrl: response.ws_url }
}
