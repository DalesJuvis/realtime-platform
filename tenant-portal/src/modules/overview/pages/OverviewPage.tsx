/**
 * # OverviewPage
 *
 * Tenant-scoped activity summary, polled every 5s, plus a client-token
 * minting panel — the honest equivalent of a payments dashboard's "API
 * keys" card: this domain's actual per-request credential is a signed
 * client token, not a static key, so minting one is the real action here.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Activity, MessageSquare, ShieldAlert, Smartphone } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { getOverviewAction } from '@actions/overview/getOverview.action'
import { mintTokenAction } from '@actions/overview/mintToken.action'
import { errorMessage } from '@lib/errors'
import { usePortalAuthStore } from '@store/portalAuth.store'
import type { Overview } from '@entities/Overview.entity'

const POLL_INTERVAL_MS = 5_000

function StatTile({ label, value, icon: Icon }: { label: string; value: number | null; icon: typeof Activity }) {
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

function MintTokenCard() {
  const [sub, setSub] = useState('demo-user')
  const [token, setToken] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)

  async function mint() {
    setSubmitting(true)
    try {
      setToken(await mintTokenAction({ sub: sub.trim() || 'demo-user' }))
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to mint token.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function copy() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    toast.success('Token copied.')
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Client token</CardTitle>
        <CardDescription>
          Mint a signed WebSocket/TCP token for a user of your app — your tenant secret never leaves the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="mint-sub">Subject (sub)</Label>
            <Input id="mint-sub" value={sub} onChange={(e) => setSub(e.target.value)} />
          </div>
          <Button className="mt-6" onClick={mint} disabled={isSubmitting}>
            {isSubmitting ? 'Minting…' : 'Mint token'}
          </Button>
        </div>
        {token && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
            <span className="flex-1 truncate">{token}</span>
            <Button type="button" variant="ghost" size="sm" onClick={copy}>
              Copy
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function OverviewPage() {
  const tenantId = usePortalAuthStore((s) => s.tenantId)
  const [overview, setOverview] = useState<Overview | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await getOverviewAction()
        if (!cancelled) setOverview(data)
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="truncate font-mono text-sm text-muted-foreground">{tenantId}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Active devices" value={overview?.active_sessions ?? null} icon={Smartphone} />
        <StatTile label="Messages processed" value={overview?.messages_total ?? null} icon={MessageSquare} />
        <StatTile label="Rate limited" value={overview?.rate_limited_total ?? null} icon={ShieldAlert} />
      </div>

      <MintTokenCard />
    </div>
  )
}
