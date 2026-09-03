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
import { PasswordInput } from '@components/shared/PasswordInput'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { signupAction } from '@actions/auth/signup.action'
import { errorMessage } from '@lib/errors'
import { env } from '@lib/env'
import { useTranslation } from '@lib/i18n'
import { GoogleButton } from './GoogleButton'

export function SignupForm() {
  const { t } = useTranslation()
  const setSession = usePortalAuthStore((s) => s.setSession)
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError(t.auth.passwordTooShort)
      return
    }
    if (password !== confirmPassword) {
      setError(t.auth.passwordMismatch)
      return
    }
    setSubmitting(true)
    try {
      // `signupAction` reads `apiUrl` from this store via the `http`
      // interceptor, so it has to land there before the call, not after.
      usePortalAuthStore.setState({ apiUrl: env.defaultApiUrl })
      const { accessToken } = await signupAction({ email: email.trim(), password })
      setSession(env.defaultApiUrl, accessToken)
      navigate('/overview', { replace: true })
    } catch (err) {
      setError(errorMessage(err, t.auth.signupFailed))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.createWorkspaceTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.auth.createWorkspaceSubtitle}</p>
      </div>

      <GoogleButton />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t.auth.orWithEmail}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">{t.auth.email}</Label>
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
          <Label htmlFor="password">{t.auth.password}</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">{t.auth.confirmPassword}</Label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t.auth.creatingWorkspace : t.auth.createAccount}
      </Button>

      <div className="space-y-1 text-center text-xs text-muted-foreground">
        <p>
          {t.auth.alreadyHaveAccount}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t.auth.signIn}
          </Link>
        </p>
        <p>
          {t.auth.joiningTeammatesTenant}{' '}
          <Link to="/join" className="font-medium text-primary hover:underline">
            {t.auth.useExistingTenantSecret}
          </Link>
        </p>
      </div>
    </form>
  )
}
