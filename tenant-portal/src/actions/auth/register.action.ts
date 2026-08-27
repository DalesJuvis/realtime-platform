/**
 * # registerAction
 *
 * Action:   Creates a portal login account for a tenant — proves ownership
 *           via the tenant's real secret (the one an admin got back once
 *           at tenant creation).
 * Endpoint: POST /api/v1/portal/auth/register
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'

export interface RegisterDto {
  readonly tenantId: string
  readonly secret: string
  readonly email: string
  readonly password: string
}

interface SessionTokenResponse {
  readonly access_token: string
  readonly token_type: string
  readonly expires_in: number
}

export async function registerAction(dto: RegisterDto): Promise<string> {
  const response = await apiRequest(
    http.post<ApiResponse<SessionTokenResponse>>('/api/v1/portal/auth/register', {
      tenant_id: dto.tenantId,
      secret: dto.secret,
      email: dto.email,
      password: dto.password,
    }),
  )
  return response.access_token
}
