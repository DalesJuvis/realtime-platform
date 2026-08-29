/**
 * # getApiKeysAction
 *
 * Action:   Every API key pair the signed-in tenant has ever generated,
 *           active or revoked.
 * Endpoint: GET /api/v1/portal/api-keys
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { ApiKey, ApiKeyStatus } from '@entities/ApiKey.entity'

interface ApiKeyResponse {
  readonly id: string
  readonly name: string
  readonly public_key: string
  readonly status: ApiKeyStatus
  readonly created_at: string
  readonly revoked_at: string | null
}

export async function getApiKeysAction(): Promise<ApiKey[]> {
  const response = await apiRequest(http.get<ApiResponse<ApiKeyResponse[]>>('/api/v1/portal/api-keys'))
  return response.map((k) => ({
    id: k.id,
    name: k.name,
    publicKey: k.public_key,
    status: k.status,
    createdAt: k.created_at,
    revokedAt: k.revoked_at,
  }))
}
