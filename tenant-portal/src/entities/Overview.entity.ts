/**
 * # OverviewEntity
 *
 * Mirrors `OverviewResponseDto` from `modules::portal` — a tenant-scoped
 * activity summary, not the full Prometheus text (see the backend DTO's
 * doc comment for why).
 */
export interface Overview {
  readonly tenant_id: string
  readonly active_sessions: number
  readonly messages_total: number
  readonly rate_limited_total: number
}
