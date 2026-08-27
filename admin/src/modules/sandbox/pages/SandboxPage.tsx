/**
 * # SandboxPage
 *
 * Twilio-Flex-style live session list, for one tenant at a time: every
 * currently connected WS/TCP session (from `PresenceService`, real, not
 * mock), polled every 5s. Clicking a session opens `SandboxSessionPage`
 * in a new tab — a live chat view joined to that session's channel(s),
 * using an admin-minted client token (no tenant secret needed).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Hash, MessageSquare, Radio } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Badge } from '@components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { useTenantsStore } from '@store/tenants.store'
import { getTenantSessionsAction } from '@actions/tenants/getTenantSessions.action'
import { errorMessage } from '@lib/errors'
import { formatDateTime } from '@lib/utils'
import type { Session } from '@entities/Session.entity'

const POLL_INTERVAL_MS = 5_000

export default function SandboxPage() {
  const tenants = useTenantsStore((s) => s.tenants)
  const [tenantId, setTenantId] = useState<string | null>(tenants[0]?.tenantId ?? null)
  const [sessions, setSessions] = useState<Session[] | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false

    async function poll() {
      try {
        const data = await getTenantSessionsAction(tenantId!)
        if (!cancelled) setSessions(data)
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Failed to load sessions.'))
      }
    }

    setSessions(null)
    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [tenantId])

  function openSession(session: Session) {
    const params = new URLSearchParams({
      tenantId: tenantId!,
      sub: session.sub,
      channels: session.channels.join(','),
    })
    window.open(`/sandbox/session?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sandbox</h1>
        <p className="text-sm text-muted-foreground">
          Join a live session's channel to test or communicate with it directly — opens in a new tab.
        </p>
      </div>

      {tenants.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No tracked tenants yet — add one from the Tenants page first.
          </CardContent>
        </Card>
      ) : (
        <>
          <Select {...(tenantId ? { value: tenantId } : {})} onValueChange={(v) => setTenantId(v)}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Select a tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.tenantId} value={t.tenantId}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Card className="shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Live sessions</CardTitle>
                <CardDescription>Every connected WS/TCP session for this tenant, right now.</CardDescription>
              </div>
              <Badge variant="success">
                <Radio className="mr-1 h-3 w-3" />
                {sessions?.length ?? 0} connected
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {sessions && sessions.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">No sessions connected right now.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {(sessions ?? []).map((session) => (
                    <li key={session.session_id}>
                      <button
                        type="button"
                        onClick={() => openSession(session)}
                        className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{session.sub}</p>
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Hash className="h-3 w-3 shrink-0" />
                            {session.channels.length > 0 ? session.channels.join(', ') : 'no channels yet'}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(session.connected_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
