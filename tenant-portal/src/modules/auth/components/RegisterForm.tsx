/**
 * # RegisterForm
 *
 * Proves ownership of a tenant by requiring its real secret — the one an
 * admin got back once from the Admin API at tenant creation.
 */

import { type FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { registerAction } from '@actions/auth/register.action'
import { errorMessage } from '@lib/errors'
import { env } from '@lib/env'

export function RegisterForm() {
  const setSession = usePortalAuthStore((s) => s.setSession)
  const navigate = useNavigate()

  const [apiUrl, setApiUrl] = useState(env.defaultApiUrl)
  const [tenantId, setTenantId] = useState('')
  const [secret, setSecret] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const normalizedApiUrl = apiUrl.trim().replace(/\/$/, '')
    try {
      // `registerAction` reads `apiUrl` from this store via the `http`
      // interceptor, so it has to land there before the call, not after.
      usePortalAuthStore.setState({ apiUrl: normalizedApiUrl })
      const accessToken = await registerAction({ tenantId: tenantId.trim(), secret, email: email.trim(), password })
      setSession(normalizedApiUrl, accessToken)
      navigate('/overview', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Registration failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Join an existing tenant</h1>
        <p className="text-sm text-muted-foreground">Prove you own this tenant to set up portal login.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="apiUrl">Portal API URL</Label>
          <Input id="apiUrl" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tenantId">Tenant ID</Label>
          <Input
            id="tenantId"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000001"
            className="font-mono text-sm"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="secret">Tenant secret</Label>
          <Input
            id="secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="issued once by the platform admin"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Joining…' : 'Join tenant'}
      </Button>

      <div className="space-y-1 text-center text-xs text-muted-foreground">
        <p>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
        <p>
          New to the platform?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </form>
  )
}
