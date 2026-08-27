/**
 * # ConnectPage
 *
 * Entry screen: WS URL, tenant ID, auth token, and a display name. The
 * token must be issued server-side (`TokenService::issue_token`) — this
 * app never derives one from a tenant secret. See `web-client/README.md`
 * for how to mint one against the local docker-compose demo tenant.
 */

import { type FormEvent, type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@components/ui/card'
import { useConnection } from '@hooks/connection/useConnection'
import { env } from '@lib/env'

export function ConnectPage() {
  const navigate = useNavigate()
  const { connect, status, credentials } = useConnection()

  const [wsUrl, setWsUrl] = useState(credentials?.wsUrl ?? env.defaultWsUrl)
  const [tenantId, setTenantId] = useState(credentials?.tenantId ?? env.defaultTenantId)
  const [token, setToken] = useState(credentials?.token ?? '')
  const [displayName, setDisplayName] = useState(credentials?.displayName ?? '')

  const isConnecting = status === 'connecting'

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    if (!wsUrl.trim() || !tenantId.trim() || !token.trim() || !displayName.trim()) return
    connect({ wsUrl: wsUrl.trim(), tenantId: tenantId.trim(), token: token.trim(), displayName: displayName.trim() })
    navigate('/chat')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect</CardTitle>
          <CardDescription>Join a realtime-engine instance to start chatting.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <Field label="WebSocket URL" htmlFor="wsUrl">
              <Input
                id="wsUrl"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                placeholder="ws://localhost:8080/ws"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Tenant ID" htmlFor="tenantId">
              <Input
                id="tenantId"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000001"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Auth token" htmlFor="token">
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="issued by TokenService::issue_token"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Display name" htmlFor="displayName">
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="alice"
                autoComplete="off"
                required
              />
            </Field>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isConnecting}>
              {isConnecting ? 'Connecting…' : 'Connect'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {label}
      </label>
      {children}
    </div>
  )
}
