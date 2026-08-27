/**
 * # createTenantAction
 *
 * Action:   Registers a new tenant. All fields optional — the server
 *           generates a v4 UUID and a random 256-bit secret for whichever
 *           are omitted.
 * Input:    CreateTenantRequest
 * Output:   TenantSecretResponse — `secret` is shown once, never re-fetchable.
 * Endpoint: POST /api/v1/admin/tenants
 */

import { http, apiRequest } from '@lib/http'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import type { RateLimitConfig, TenantId, TenantSecretResponse } from '@entities/Tenant.entity'

export interface CreateTenantRequest {
  readonly tenant_id?: TenantId
  readonly secret?: string
  readonly limits?: RateLimitConfig
}

export async function createTenantAction(dto: CreateTenantRequest = {}): Promise<TenantSecretResponse> {
  return apiRequest(http.post<ApiResponse<TenantSecretResponse>>('/api/v1/admin/tenants', dto))
}
