/**
 * # SignupForm
 *
 * Self-serve "create account" — creates a brand-new tenant, a key pair,
 * and a portal login account in one step. No tenant secret required
 * upfront: unlike `JoinForm`, there is no existing tenant to prove
 * ownership of yet.
 */

import { type FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { signupAction } from '@actions/auth/signup.action'
import { errorMessage } from '@lib/errors'
import { env } from '@lib/env'
import { GoogleButton } from './GoogleButton'

export function SignupForm() {
  const setSession = usePortalAuthStore((s) => s.setSession)
  const navigate = useNavigate()

  const [apiUrl, setApiUrl] = useState(env.defaultApiUrl)
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
      // `signupAction` reads `apiUrl` from this store via the `http`
      // interceptor, so it has to land there before the call, not after.
      usePortalAuthStore.setState({ apiUrl: normalizedApiUrl })
      const { accessToken } = await signupAction({ email: email.trim(), password })
      setSession(normalizedApiUrl, accessToken)
      navigate('/overview', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="text-sm text-muted-foreground">
          We'll set up your tenant and an SDK key pair automatically.
        </p>
      </div>

      <GoogleButton />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or with email</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="apiUrl">Portal API URL</Label>
          <Input id="apiUrl" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating workspace…' : 'Create account'}
      </Button>

      <div className="space-y-1 text-center text-xs text-muted-foreground">
        <p>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
        <p>
          Joining a teammate's tenant?{' '}
          <Link to="/join" className="font-medium text-primary hover:underline">
            Use an existing tenant secret
          </Link>
        </p>
      </div>
    </form>
  )
}
