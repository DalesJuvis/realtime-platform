/**
 * # rotateSecretAction
 *
 * Action:   Generates a new secret key for the signed-in tenant. Every
 *           already-issued client token keeps validating until it
 *           expires — this stops future mint/validate calls from
 *           trusting the old secret, it does not revoke tokens already handed out.
 * Endpoint: POST /api/v1/portal/keys/rotate
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { KeyPair } from '@entities/KeyPair.entity'

interface KeyPairResponse {
  readonly tenant_id: string
  readonly secret_key: string
}

export async function rotateSecretAction(): Promise<KeyPair> {
  const response = await apiRequest(http.post<ApiResponse<KeyPairResponse>>('/api/v1/portal/keys/rotate'))
  return { tenantId: response.tenant_id, secretKey: response.secret_key }
}
