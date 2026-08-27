/**
 * # RevealSecretDialog
 *
 * Shows a freshly (re)generated tenant secret — the ONLY moment it's ever
 * visible; this app never persists it (see `tenants.store.ts`). Also lets
 * the admin mint a client token right here, while the secret is still in
 * memory, without ever writing it to storage — see `mintClientToken`.
 */

import { useState } from 'react'
import { Copy, Check, TriangleAlert } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { mintClientToken } from '@lib/mintToken'
import type { TenantId } from '@entities/Tenant.entity'

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
        <span className="flex-1 truncate">{value}</span>
        <Button type="button" variant="ghost" size="icon" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export function RevealSecretDialog({ tenantId, secret }: { tenantId: TenantId; secret: string }) {
  const [sub, setSub] = useState('demo-user')
  const [token, setToken] = useState<string | null>(null)

  async function mint() {
    setToken(await mintClientToken(tenantId, secret, sub.trim() || 'demo-user'))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Copy this now — the raw secret is never shown again after this dialog closes.</p>
      </div>

      <CopyableField label="Tenant ID" value={tenantId} />
      <CopyableField label="Secret" value={secret} />

      <div className="space-y-2 border-t border-border pt-4">
        <Label htmlFor="mint-sub">Mint a test client token (sub)</Label>
        <div className="flex gap-2">
          <Input id="mint-sub" value={sub} onChange={(e) => setSub(e.target.value)} placeholder="demo-user" />
          <Button type="button" variant="outline" onClick={mint}>
            Mint
          </Button>
        </div>
        {token && <CopyableField label="Client token (1h, HMAC-signed)" value={token} />}
      </div>
    </div>
  )
}
