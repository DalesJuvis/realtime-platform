/**
 * # getMetricsAction
 *
 * Action:   Fetches and parses the Prometheus scrape endpoint —
 *           unauthenticated, plain text, not the `{success,data}` envelope.
 * Input:    none
 * Output:   MetricsSnapshot
 * Endpoint: GET /api/v1/system/metrics
 */

import { http } from '@lib/http'
import type { MetricsSnapshot } from '@entities/System.entity'

/**
 * Minimal Prometheus text-exposition parser: sums every sample of a given
 * metric name (across all label combinations) — sufficient for the gauges
 * and counters `MetricsService` (backend) actually registers, not a
 * general-purpose parser (no histogram bucket handling, no HELP/TYPE use).
 */
function sumMetric(raw: string, metricName: string): number | null {
  const lines = raw.split('\n').filter((line) => line.startsWith(metricName) && !line.startsWith('#'))
  if (lines.length === 0) return null

  let total = 0
  for (const line of lines) {
    const value = Number(line.trim().split(/\s+/).pop())
    if (Number.isFinite(value)) total += value
  }
  return total
}

export function parsePrometheusMetrics(raw: string): MetricsSnapshot {
  return {
    wsConnectionsActive: sumMetric(raw, 'realtime_engine_ws_connections_active'),
    tcpConnectionsActive: sumMetric(raw, 'realtime_engine_tcp_connections_active'),
    messagesTotal: sumMetric(raw, 'realtime_engine_messages_total'),
    pushFallbackTotal: sumMetric(raw, 'realtime_engine_push_fallback_total'),
    rateLimitedTotal: sumMetric(raw, 'realtime_engine_rate_limited_total'),
    raw,
  }
}

export async function getMetricsAction(): Promise<MetricsSnapshot> {
  const response = await http.get<string>('/api/v1/system/metrics', { responseType: 'text' })
  return parsePrometheusMetrics(response.data)
}
