/**
 * # VapidKeyCard
 *
 * Shows this backend instance's VAPID public key
 * (`Settings::vapid_public_key` server-side) with a copy button — the
 * value a third-party site's `PushManager.subscribe({ applicationServerKey })`
 * call needs for real Web Push (notifications with the tab/browser fully
 * closed — see DOCS.md's Web Push section). Not tenant-scoped: every
 * tenant on this instance shares the same keypair (see `getVapidKeyAction`'s
 * own doc comment) — this only surfaces it, never mints or rotates
 * anything. Shared as-is between `OverviewPage` and `SettingsPage`, same
 * pattern as `MintTokenCard`.
 *
 * Renders nothing once loaded if Web Push isn't configured on this
 * instance at all (`null` key) — no point showing an empty box with
 * nothing to copy.
 */

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { CopyButton } from '@components/shared/CopyButton'
import { getVapidKeyAction } from '@actions/vapid/getVapidKey.action'

export function VapidKeyCard() {
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getVapidKeyAction()
      .then(setVapidKey)
      .catch(() => setVapidKey(null))
      .finally(() => setLoaded(true))
  }, [])

  if (loaded && !vapidKey) return null

  return (
    <Card className="rounded-sm shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          VAPID public key
        </CardTitle>
        <CardDescription>
          For real Web Push (notifications with the tab or browser fully closed) from your own site or app — pass
          this as <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">applicationServerKey</code> to{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">PushManager.subscribe()</code>. Shared by
          every tenant on this instance — not a secret, safe to embed client-side.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {vapidKey ? (
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="flex-1 truncate font-mono text-xs">{vapidKey}</span>
            <CopyButton value={vapidKey} label="VAPID public key" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </CardContent>
    </Card>
  )
}
