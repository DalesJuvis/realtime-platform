/**
 * # SystemEntity
 *
 * Shapes for the unauthenticated `system` segment (`/api/v1/system/*`):
 * a liveness probe and a Prometheus scrape endpoint. `MetricsSnapshot` is
 * this app's own parsed view of a handful of gauges/counters out of the
 * full Prometheus text body — see `parsePrometheusMetrics` in
 * `getMetrics.action.ts`. Mirrors exactly what `MetricsService` (backend)
 * registers, nothing more.
 */

export interface MetricsSnapshot {
  readonly wsConnectionsActive: number | null
  readonly tcpConnectionsActive: number | null
  /** Sum of `realtime_engine_messages_total` across every tenant/opcode label. */
  readonly messagesTotal: number | null
  /** Sum of `realtime_engine_push_fallback_total` across every tenant label. */
  readonly pushFallbackTotal: number | null
  /** Sum of `realtime_engine_rate_limited_total` across every tenant label. */
  readonly rateLimitedTotal: number | null
  readonly raw: string
}
