/**
 * # MintTokenCard
 *
 * Mints a signed WebSocket/TCP client token and offers it as a
 * downloadable `mio-credentials.json` — everything `new RealtimeClient(...)`
 * needs in one file (see `lib/credentialsFile.ts`). Backed by
 * `store/mintedToken.store` so the result survives a page reload, and
 * shared as-is between `OverviewPage` and `ApiKeysPage` — minting is the
 * same operation regardless of which page you start it from.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { CopyButton } from '@components/shared/CopyButton'
import { mintTokenAction } from '@actions/overview/mintToken.action'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { errorMessage } from '@lib/errors'
import { buildCredentialsFile, isCredentialsExpired } from '@lib/credentialsFile'
import { downloadBlob, formatDuration } from '@lib/utils'
import { useMintedTokenStore } from '@store/mintedToken.store'

/** Mirrors the backend's own cap (`MintClientTokenUseCase::MAX_TTL_SECS`)
 * — a caller-supplied `ttl_secs` beyond this is silently clamped server-side
 * rather than rejected, so nothing here needs to reject it either; these
 * are just the presets worth offering. 1 hour stays the default: a
 * deliberately-chosen long-lived token (e.g. for a static site embed that
 * won't come back to re-mint) should be an explicit choice, not the
 * pre-selected one. */
const TTL_PRESETS = [
  { label: '1 hour (default)', secs: 3600 },
  { label: '24 hours', secs: 24 * 3600 },
  { label: '7 days', secs: 7 * 24 * 3600 },
  { label: '30 days (maximum)', secs: 30 * 24 * 3600 },
] as const

export function MintTokenCard() {
  const credentials = useMintedTokenStore((s) => s.credentials)
  const setCredentials = useMintedTokenStore((s) => s.setCredentials)
  const [sub, setSub] = useState('demo-user')
  const [ttlSecs, setTtlSecs] = useState<number>(TTL_PRESETS[0].secs)
  const [isSubmitting, setSubmitting] = useState(false)

  const live = credentials && !isCredentialsExpired(credentials) ? credentials : null

  async function mint() {
    setSubmitting(true)
    try {
      const effectiveSub = sub.trim() || 'demo-user'
      // Both calls hit the caller's own already-authenticated portal
      // session — `getKeysAction` never touches the tenant secret itself
      // (see its own doc comment), just the public `tenant_id` this file
      // also needs.
      const [minted, keys] = await Promise.all([mintTokenAction({ sub: effectiveSub, ttlSecs }), getKeysAction()])
      setCredentials({
        token: minted.token,
        expiresIn: minted.expiresIn,
        wsUrl: minted.wsUrl,
        tenantId: keys.tenantId,
        sub: effectiveSub,
        issuedAt: new Date().toISOString(),
      })
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to mint token.'))
    } finally {
      setSubmitting(false)
    }
  }

  function downloadCredentials() {
    if (!live) return
    const file = buildCredentialsFile(live)
    downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), 'mio-credentials.json')
  }

  return (
    <Card className="rounded-sm shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Client token</CardTitle>
        <CardDescription>
          Mint a signed WebSocket/TCP token for a user of your app — your secret key never leaves the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="mint-sub">Subject (sub)</Label>
            <Input id="mint-sub" value={sub} onChange={(e) => setSub(e.target.value)} />
          </div>
          <div className="w-40 space-y-1.5">
            <Label htmlFor="mint-ttl">Expires in</Label>
            <Select value={String(ttlSecs)} onValueChange={(v) => setTtlSecs(Number(v))}>
              <SelectTrigger id="mint-ttl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TTL_PRESETS.map((preset) => (
                  <SelectItem key={preset.secs} value={String(preset.secs)}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="mt-6" onClick={mint} disabled={isSubmitting}>
            {isSubmitting ? 'Minting…' : 'Mint token'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A long-lived token stays valid until it expires, with no way to revoke it early — pick the shortest
          duration that fits how you'll use it. For a hand-pasted embed on a static site with no backend of its
          own, that's usually a longer preset than the 1-hour default: there's no automated renewal, so when it
          expires you'll need to mint a new one and re-paste it.
        </p>
        {live && (
          <>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
              <span className="flex-1 truncate">{live.token}</span>
              <CopyButton value={live.token} label="Token" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Expires in {formatDuration(live.expiresIn)}.</p>
              <Button type="button" variant="outline" size="sm" onClick={downloadCredentials}>
                <Download className="h-4 w-4" />
                Download mio-credentials.json
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
