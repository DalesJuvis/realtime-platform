/**
 * # loginAction
 *
 * Action:   Authenticates a portal login and returns a session token.
 * Endpoint: POST /api/v1/portal/auth/login
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export interface LoginDto {
  readonly email: string
  readonly password: string
}

interface SessionTokenResponse {
  readonly access_token: string
  readonly token_type: string
  readonly expires_in: number
}

export async function loginAction(dto: LoginDto): Promise<string> {
  const response = await apiRequest(
    http.post<ApiResponse<SessionTokenResponse>>('/api/v1/portal/auth/login', dto),
  )
  return response.access_token
}
