/**
 * # TenantEntity
 *
 * Mirrors the real backend's tenant shape exactly — `backend/src/modules/admin/dto`:
 * a tenant is nothing but an ID, an HMAC secret (`TokenService`'s signing
 * key for that tenant's client tokens), and rate-limit quotas. No name,
 * email, status, or approval workflow exists server-side.
 * Source: POST/PUT /api/v1/admin/tenants — see `actions/tenants/*`.
 */

export type TenantId = string

export interface RateLimitConfig {
  readonly session_capacity: number
  readonly session_refill_per_sec: number
  readonly tenant_capacity: number
  readonly tenant_refill_per_sec: number
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  session_capacity: 20,
  session_refill_per_sec: 10,
  tenant_capacity: 2_000,
  tenant_refill_per_sec: 500,
}

/** Response shape for both create and rotate-secret — the secret is shown once, never re-fetchable. */
export interface TenantSecretResponse {
  readonly tenant_id: TenantId
  readonly secret: string
}

/**
 * The backend has no tenant-listing endpoint (secrets live in an in-memory
 * `TenantSecretRepository`, per-engine-instance, nothing durable to list) —
 * so this app keeps its own local record of tenants it has created or been
 * told about, to have something to act on (revoke/rotate/limits). Only the
 * ID and an optional label are kept; the secret is never persisted here —
 * see the security note in `tenants.store.ts`.
 */
export interface KnownTenant {
  readonly tenantId: TenantId
  readonly label: string
  readonly addedAt: string
  readonly limits: RateLimitConfig | null
}
