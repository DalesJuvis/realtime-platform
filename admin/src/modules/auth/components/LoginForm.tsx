/**
 * # LoginForm
 *
 * Connect screen: Admin API URL + bearer token — this backend has no login
 * endpoint (`AdminTokenGuard` checks a single static `ADMIN_API_TOKEN`, the
 * same token for every caller). Nothing is verified here; the first real
 * admin call either works or 401s (see `http.ts`'s interceptor).
 */

import { type FormEvent, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { useAdminAuthStore } from '@store/adminAuth.store'
import { env } from '@lib/env'

export function LoginForm() {
  const connect = useAdminAuthStore((s) => s.connect)
  const navigate = useNavigate()
  const location = useLocation()
  const [apiUrl, setApiUrl] = useState(env.defaultApiUrl)
  const [token, setToken] = useState('')

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    if (!apiUrl.trim() || !token.trim()) return
    connect({ apiUrl: apiUrl.trim().replace(/\/$/, ''), token: token.trim() })
    const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/admin'
    navigate(from, { replace: true })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Connect</h1>
        <p className="text-sm text-muted-foreground">Manage tenants on one realtime-engine instance.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="apiUrl">Admin API URL</Label>
          <Input
            id="apiUrl"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://localhost:9090"
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">
            The engine's admin port (<code className="font-mono">ADMIN_BIND_ADDR</code>) — never expose this
            publicly.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="token">Admin token</Label>
          <Input
            id="token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_API_TOKEN"
            autoComplete="off"
            required
          />
        </div>
      </div>

      <Button type="submit" className="w-full">
        Connect
      </Button>
    </form>
  )
}
