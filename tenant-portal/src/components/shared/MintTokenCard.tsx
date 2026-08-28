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
import { CopyButton } from '@components/shared/CopyButton'
import { mintTokenAction } from '@actions/overview/mintToken.action'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { errorMessage } from '@lib/errors'
import { buildCredentialsFile, isCredentialsExpired } from '@lib/credentialsFile'
import { downloadBlob } from '@lib/utils'
import { useMintedTokenStore } from '@store/mintedToken.store'

export function MintTokenCard() {
  const credentials = useMintedTokenStore((s) => s.credentials)
  const setCredentials = useMintedTokenStore((s) => s.setCredentials)
  const [sub, setSub] = useState('demo-user')
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
      const [minted, keys] = await Promise.all([mintTokenAction({ sub: effectiveSub }), getKeysAction()])
      setCredentials({
        token: minted.token,
        expiresIn: minted.expiresIn,
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
          <Button className="mt-6" onClick={mint} disabled={isSubmitting}>
            {isSubmitting ? 'Minting…' : 'Mint token'}
          </Button>
        </div>
        {live && (
          <>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
              <span className="flex-1 truncate">{live.token}</span>
              <CopyButton value={live.token} label="Token" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Expires in {Math.round(live.expiresIn / 60)} min.</p>
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
