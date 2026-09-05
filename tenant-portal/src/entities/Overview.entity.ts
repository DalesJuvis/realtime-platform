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
  /** Split of the notification log by delivery path — see
   * `NotificationDelivery` on the backend. Sourced from the same
   * `notifications` rows the bell lists, so these always agree with what
   * a tenant sees there. */
  readonly realtime_messages_total: number
  readonly push_messages_total: number
}
