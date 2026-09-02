/**
 * # OverviewPage
 *
 * Workspace landing page, cloned from saas-admin's Stripe-Home-style
 * `OverviewPage` — stat tiles with trend sparklines, a resource-count row,
 * recent-activity lists, and a right rail (setup guide, recommendations,
 * API key). Adapted rather than ported literally: this platform has no
 * payments/customers/transactions domain, and no backend time-series
 * endpoint to bucket by day — so there's no date-range selector (a "Last 7
 * days" picker with nothing behind it would be worse than no picker), and
 * the sparklines are a genuine live trend built from this page's own 5s
 * poll history, not fabricated daily aggregates.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Hash, MessageSquare, ShieldAlert, FileText, KeyRound, TrendingUp, Maximize2, Minimize2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'
import { Sparkline } from '@components/shared/Sparkline'
import { ActivityChart, type ActivitySample } from '@components/shared/ActivityChart'
import { SetupGuideCard } from '@components/shared/SetupGuideCard'
import { CopyButton } from '@components/shared/CopyButton'
import { MintTokenCard } from '@components/shared/MintTokenCard'
import { VapidKeyCard } from '@components/shared/VapidKeyCard'
import { getOverviewAction } from '@actions/overview/getOverview.action'
import { getChannelsAction } from '@actions/channels/getChannels.action'
import { getTemplatesAction } from '@actions/templates/getTemplates.action'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { env } from '@lib/env'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { useUiStore } from '@store/ui.store'
import type { Overview } from '@entities/Overview.entity'
import type { Channel } from '@entities/Channel.entity'
import type { Template } from '@entities/Template.entity'

const POLL_INTERVAL_MS = 5_000
const SAMPLE_HISTORY_SIZE = 20

/**
 * One entry per poll tick (every 5s), all three metrics aligned to the same
 * timestamp — feeds both the per-tile sparklines and `ActivityChart` from a
 * single source, rather than three independently-deduped histories that
 * could drift out of sync with each other.
 */
function useActivityHistory(overview: Overview | null) {
  const [history, setHistory] = useState<ActivitySample[]>([])

  useEffect(() => {
    if (!overview) return
    setHistory((prev) =>
      [
        ...prev,
        {
          label: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          sessions: overview.active_sessions,
          messages: overview.messages_total,
          rateLimited: overview.rate_limited_total,
        },
      ].slice(-SAMPLE_HISTORY_SIZE),
    )
  }, [overview])

  return history
}

function StatTile({
  label,
  value,
  icon: Icon,
  history,
}: {
  label: string
  value: number | null
  icon: typeof Activity
  history: number[]
}) {
  return (
    <Card className="rounded-sm shadow-none">
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <p className="text-xl font-semibold tabular-nums">{value ?? '—'}</p>
        <Sparkline values={history} />
      </CardContent>
    </Card>
  )
}

function LinkTile({ label, value, to }: { label: string; value: number | null; to: string }) {
  return (
    <Card className="rounded-sm shadow-none">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{value ?? '—'}</p>
        </div>
        <Link to={to} className="text-sm font-medium text-primary hover:underline">
          View
        </Link>
      </CardContent>
    </Card>
  )
}

/**
 * Stat tiles + the Activity chart — the "metrics" `OverviewPage`'s focus
 * mode isolates. Extracted so that view and the normal full layout render
 * the exact same cards rather than two copies that could drift apart.
 */
function MetricsGrid({
  overview,
  sessionsHistory,
  messagesHistory,
  rateLimitedHistory,
  activityHistory,
}: {
  overview: Overview | null
  sessionsHistory: number[]
  messagesHistory: number[]
  rateLimitedHistory: number[]
  activityHistory: ActivitySample[]
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Active sessions" value={overview?.active_sessions ?? null} icon={Activity} history={sessionsHistory} />
        <StatTile label="Messages processed" value={overview?.messages_total ?? null} icon={MessageSquare} history={messagesHistory} />
        <StatTile label="Rate limited" value={overview?.rate_limited_total ?? null} icon={ShieldAlert} history={rateLimitedHistory} />
      </div>

      <Card className="rounded-sm shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Activity
          </CardTitle>
          <CardDescription>Active sessions, messages processed, and rate-limited sends — live, last {SAMPLE_HISTORY_SIZE} samples.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityChart samples={activityHistory} />
        </CardContent>
      </Card>
    </div>
  )
}

function PublicKeyCard() {
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    getKeysAction()
      .then((keys) => setTenantId(keys.tenantId))
      .catch(() => setTenantId(null))
  }, [])

  return (
    <Card className="rounded-sm border-none bg-primary/5 shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          Public key
        </CardTitle>
        <Badge variant={env.appEnv === 'production' ? 'destructive' : 'neutral'} className="capitalize">
          {env.appEnv}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your tenant ID for this environment — safe to embed in an SDK config, never a secret.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
          <span className="flex-1 truncate">{tenantId ?? '…'}</span>
          {tenantId && <CopyButton value={tenantId} label="Public key" />}
        </div>
        <Link to="/settings" className="inline-block text-sm font-medium text-primary hover:underline">
          Go to API keys →
        </Link>
      </CardContent>
    </Card>
  )
}

export default function OverviewPage() {
  const email = usePortalAuthStore((s) => s.email)
  const focusMode = useUiStore((s) => s.focusMode)
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [templates, setTemplates] = useState<Template[] | null>(null)

  const activityHistory = useActivityHistory(overview)
  const sessionsHistory = activityHistory.map((s) => s.sessions)
  const messagesHistory = activityHistory.map((s) => s.messages)
  const rateLimitedHistory = activityHistory.map((s) => s.rateLimited)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const [ov, ch, tp] = await Promise.all([getOverviewAction(), getChannelsAction(), getTemplatesAction()])
        if (cancelled) return
        setOverview(ov)
        setChannels(ch)
        setTemplates(tp)
      } catch {
        // transient network hiccup — next poll tick retries; no need to spam a toast
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const topChannels = [...(channels ?? [])].sort((a, b) => b.subscriber_count - a.subscriber_count).slice(0, 5)
  const recentTemplates = [...(templates ?? [])].slice(0, 5)

  const recommendations: { message: string; to: string; linkLabel: string }[] = []
  if (channels && channels.length === 0) {
    recommendations.push({
      message: 'No channels yet — publish or subscribe to create one.',
      to: '/broadcasting',
      linkLabel: 'Send a broadcast',
    })
  }
  if (templates && templates.length === 0) {
    recommendations.push({
      message: 'No templates yet — save one to speed up your broadcasts.',
      to: '/templates',
      linkLabel: 'Create a template',
    })
  }
  if (overview && overview.rate_limited_total > 0) {
    recommendations.push({
      message: `${overview.rate_limited_total} message${overview.rate_limited_total === 1 ? '' : 's'} rate-limited so far — check your send rate if this keeps growing.`,
      to: '/broadcasting',
      linkLabel: 'Go to Broadcasting',
    })
  }

  if (focusMode) {
    // Kiosk/TV view: sidebar, top banner/mobile header, and this page's
    // own right rail are all animated away by `AppLayout`/`AppSidebar`
    // reading the same `focusMode` flag (see their doc comments) — this
    // branch only has to isolate the metrics themselves and center them.
    // Polling above keeps running unchanged: the whole point is that this
    // stays live.
    return (
      <div className="relative flex min-h-[70vh] items-center justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0"
              onClick={toggleFocusMode}
              aria-label="Exit focus mode"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Exit focus mode</TooltipContent>
        </Tooltip>

        <div className="w-full max-w-3xl">
          <MetricsGrid
            overview={overview}
            sessionsHistory={sessionsHistory}
            messagesHistory={messagesHistory}
            rateLimitedHistory={rateLimitedHistory}
            activityHistory={activityHistory}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">{email} — workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success" className="gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
            Live · updates every 5s
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={toggleFocusMode} aria-label="Focus on metrics">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Focus on metrics — hides the sidebar and everything else</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="space-y-6 lg:col-span-2">
          <MetricsGrid
            overview={overview}
            sessionsHistory={sessionsHistory}
            messagesHistory={messagesHistory}
            rateLimitedHistory={rateLimitedHistory}
            activityHistory={activityHistory}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LinkTile label="Channels" value={channels?.length ?? null} to="/channels" />
            <LinkTile label="Templates" value={templates?.length ?? null} to="/templates" />
          </div>

          <Card className="rounded-sm shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Hash className="h-4 w-4 text-muted-foreground" />
                Top channels
              </CardTitle>
              <Link to="/channels" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {channels === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : topChannels.length === 0 ? (
                <p className="text-sm text-muted-foreground">No channels yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {topChannels.map((c) => (
                    <li key={c.channel_id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="truncate font-mono">{c.channel_id}</span>
                      <span className="tabular-nums text-muted-foreground">{c.subscriber_count} subscribers</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-sm shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Recent templates
              </CardTitle>
              <Link to="/templates" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {templates === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : recentTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No templates yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recentTemplates.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="truncate font-medium">{t.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <MintTokenCard />
          <VapidKeyCard />
        </div>

        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <SetupGuideCard />

          {recommendations.length > 0 && (
            <Card className="rounded-sm border-none bg-primary/5 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recommendations.map((r) => (
                  <div key={r.message} className="space-y-1 border-t border-border pt-4 first:border-t-0 first:pt-0">
                    <p className="text-sm text-muted-foreground">{r.message}</p>
                    <Link to={r.to} className="text-sm font-medium text-primary hover:underline">
                      {r.linkLabel}
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <PublicKeyCard />
        </div>
      </div>
    </div>
  )
}
