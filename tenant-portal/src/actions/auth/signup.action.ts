/**
 * # signupAction
 *
 * Action:   Self-serve "create account" — creates a brand-new tenant, a
 *           key pair, and a portal login account in one step. No
 *           pre-existing tenant secret needed, unlike `registerAction`.
 * Endpoint: POST /api/v1/portal/auth/signup
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { KeyPair } from '@entities/KeyPair.entity'

export interface SignupDto {
  readonly email: string
  readonly password: string
}

export interface SignupResult {
  readonly accessToken: string
  readonly keys: KeyPair
}

interface SignupResponse {
  readonly access_token: string
  readonly token_type: string
  readonly expires_in: number
  readonly keys: { readonly tenant_id: string; readonly secret_key: string }
}

export async function signupAction(dto: SignupDto): Promise<SignupResult> {
  const response = await apiRequest(
    http.post<ApiResponse<SignupResponse>>('/api/v1/portal/auth/signup', dto),
  )
  return {
    accessToken: response.access_token,
    keys: { tenantId: response.keys.tenant_id, secretKey: response.keys.secret_key },
  }
}
