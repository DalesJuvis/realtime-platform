/**
 * # getKeysAction
 *
 * Action:   Reads the signed-in tenant's current key pair.
 * Endpoint: GET /api/v1/portal/keys
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { KeyPair } from '@entities/KeyPair.entity'

interface KeyPairResponse {
  readonly tenant_id: string
  readonly secret_key: string
}

export async function getKeysAction(): Promise<KeyPair> {
  const response = await apiRequest(http.get<ApiResponse<KeyPairResponse>>('/api/v1/portal/keys'))
  return { tenantId: response.tenant_id, secretKey: response.secret_key }
}
