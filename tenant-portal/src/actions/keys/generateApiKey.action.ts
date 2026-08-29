/**
 * # generateApiKeyAction
 *
 * Action:   Generates a new, named, independently-revocable API key pair
 *           — additive, never touches the tenant's primary secret.
 * Endpoint: POST /api/v1/portal/api-keys
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { GeneratedApiKey } from '@entities/ApiKey.entity'

interface GeneratedApiKeyResponse {
  readonly id: string
  readonly name: string
  readonly public_key: string
  readonly secret: string
  readonly created_at: string
}

export async function generateApiKeyAction(name: string): Promise<GeneratedApiKey> {
  const response = await apiRequest(
    http.post<ApiResponse<GeneratedApiKeyResponse>>('/api/v1/portal/api-keys', { name }),
  )
  return {
    id: response.id,
    name: response.name,
    publicKey: response.public_key,
    secret: response.secret,
    createdAt: response.created_at,
  }
}
