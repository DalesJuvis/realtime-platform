/**
 * # DashboardPage
 *
 * Live view of the connected engine instance: liveness + a handful of
 * Prometheus gauges/counters (`getMetricsAction`), polled every 5s. This is
 * everything the Admin API exposes about instance state — no tenant counts
 * (no listing endpoint), no historical charts (this app has no time-series
 * store of its own).
 */

import { useEffect, useState } from 'react'
import { Activity, Radio, MessageSquare, BellRing, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card'
import { Badge } from '@components/ui/badge'
import { getHealthAction } from '@actions/system/getHealth.action'
import { getMetricsAction } from '@actions/system/getMetrics.action'
import { useAdminAuthStore } from '@store/adminAuth.store'
import type { MetricsSnapshot } from '@entities/System.entity'

const POLL_INTERVAL_MS = 5_000

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | null
  icon: typeof Activity
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
        </div>
        <Icon className="h-8 w-8 text-muted-foreground/40" />
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const apiUrl = useAdminAuthStore((s) => s.apiUrl)
  const [healthy, setHealthy] = useState<boolean | null>(null)
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      const [health, snapshot] = await Promise.all([
        getHealthAction().catch(() => false),
        getMetricsAction().catch(() => null),
      ])
      if (!cancelled) {
        setHealthy(health)
        setMetrics(snapshot)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [apiUrl])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="truncate text-sm text-muted-foreground">{apiUrl}</p>
        </div>
        {healthy !== null && (
          <Badge variant={healthy ? 'success' : 'destructive'}>{healthy ? 'Healthy' : 'Unreachable'}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="WebSocket connections" value={metrics?.wsConnectionsActive ?? null} icon={Radio} />
        <StatTile label="TCP connections" value={metrics?.tcpConnectionsActive ?? null} icon={Activity} />
        <StatTile label="Messages processed" value={metrics?.messagesTotal ?? null} icon={MessageSquare} />
        <StatTile label="Push fallbacks" value={metrics?.pushFallbackTotal ?? null} icon={BellRing} />
      </div>

      {metrics && metrics.rateLimitedTotal !== null && metrics.rateLimitedTotal > 0 && (
        <Card className="border-amber-200 bg-amber-50 shadow-none dark:border-amber-900/40 dark:bg-amber-900/10">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-800 dark:text-amber-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {metrics.rateLimitedTotal} frame{metrics.rateLimitedTotal === 1 ? '' : 's'} rejected by the rate limiter
            since this instance started.
          </CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Raw metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-4 text-xs">
            {metrics?.raw ?? 'No data yet.'}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
