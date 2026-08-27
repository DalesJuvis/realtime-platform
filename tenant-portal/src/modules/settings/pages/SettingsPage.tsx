/**
 * # SettingsPage
 *
 * API key pair (this system's honest equivalent of a Stripe-style
 * publishable/secret pair — see `getKeysAction`'s doc comment), account
 * info, and the live "connected sessions" view (moved here from its own
 * former page, folded in as one settings section).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Eye, EyeOff, KeyRound, LogOut, RefreshCw, Radio } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@components/ui/table'
import { Badge } from '@components/ui/badge'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { rotateSecretAction } from '@actions/keys/rotateSecret.action'
import { getDevicesAction } from '@actions/devices/getDevices.action'
import { errorMessage } from '@lib/errors'
import { formatDateTime } from '@lib/utils'
import { usePortalAuthStore } from '@store/portalAuth.store'
import type { KeyPair } from '@entities/KeyPair.entity'
import type { Device } from '@entities/Device.entity'

const POLL_INTERVAL_MS = 5_000

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  async function copy() {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied.`)
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className={`flex-1 truncate text-xs ${mono ? 'font-mono' : ''}`}>{value}</span>
      <Button type="button" variant="ghost" size="sm" onClick={copy}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function KeysCard() {
  const [keys, setKeys] = useState<KeyPair | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [isRotating, setRotating] = useState(false)
  const [notFound, setNotFound] = useState(false)

  function load() {
    getKeysAction()
      .then((data) => {
        setKeys(data)
        setNotFound(false)
      })
      .catch((err) => {
        if (errorMessage(err).includes('rotate')) setNotFound(true)
        else toast.error(errorMessage(err, 'Failed to load keys.'))
      })
  }

  useEffect(load, [])

  async function rotate() {
    if (!confirm('Rotate your secret key? Anything still using the old one will stop being able to mint new tokens.')) return
    setRotating(true)
    try {
      const next = await rotateSecretAction()
      setKeys(next)
      setNotFound(false)
      setRevealed(true)
      toast.success('Secret key rotated.')
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to rotate key.'))
    } finally {
      setRotating(false)
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          API keys
        </CardTitle>
        <CardDescription>
          Use these in the SDK — the public key identifies your tenant, the secret key mints client tokens
          server-side (see <code className="font-mono text-xs">POST /api/v1/auth/tokens</code>). Never ship the
          secret key to a browser or mobile app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notFound ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No durable key pair on record for this tenant yet — rotate to generate one.
            </p>
            <Button onClick={rotate} disabled={isRotating}>
              <RefreshCw className="h-4 w-4" />
              {isRotating ? 'Generating…' : 'Generate key pair'}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Public key (tenant ID)</Label>
              <CopyField label="Public key" value={keys?.tenantId ?? '…'} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Secret key</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {revealed ? 'Hide' : 'Reveal'}
                </Button>
              </div>
              <CopyField
                label="Secret key"
                value={keys ? (revealed ? keys.secretKey : '•'.repeat(32)) : '…'}
              />
            </div>
            <Button variant="outline" onClick={rotate} disabled={isRotating}>
              <RefreshCw className="h-4 w-4" />
              {isRotating ? 'Rotating…' : 'Rotate secret key'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function AccountCard() {
  const email = usePortalAuthStore((s) => s.email)
  const tenantId = usePortalAuthStore((s) => s.tenantId)
  const logout = usePortalAuthStore((s) => s.logout)

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <p className="text-sm">{email}</p>
        </div>
        <div className="space-y-1.5">
          <Label>Tenant ID</Label>
          <p className="truncate font-mono text-xs text-muted-foreground">{tenantId}</p>
        </div>
        <Button variant="outline" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </CardContent>
    </Card>
  )
}

function SessionsCard() {
  const [devices, setDevices] = useState<Device[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const data = await getDevicesAction()
        if (!cancelled) setDevices(data)
      } catch {
        // transient network hiccup — next poll tick retries
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
    <Card className="shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Connected sessions</CardTitle>
          <CardDescription>Live WebSocket/TCP connections for your tenant.</CardDescription>
        </div>
        <Badge variant="success">
          <Radio className="mr-1 h-3 w-3" />
          {devices?.length ?? 0} connected
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {devices && devices.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No devices connected right now.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Connected since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(devices ?? []).map((device) => (
                <TableRow key={device.session_id}>
                  <TableCell className="font-medium">{device.sub}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {device.channels.length > 0 ? device.channels.join(', ') : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(device.connected_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Keys, account, and connected sessions.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <KeysCard />
        <AccountCard />
      </div>

      <SessionsCard />
    </div>
  )
}
