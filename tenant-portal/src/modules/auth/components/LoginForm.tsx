import { type FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { PasswordInput } from '@components/shared/PasswordInput'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { loginAction } from '@actions/auth/login.action'
import { errorMessage } from '@lib/errors'
import { env } from '@lib/env'
import { useTranslation } from '@lib/i18n'
import { GoogleButton } from './GoogleButton'

export function LoginForm() {
  const { t } = useTranslation()
  const setSession = usePortalAuthStore((s) => s.setSession)
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      usePortalAuthStore.setState({ apiUrl: env.defaultApiUrl })
      const accessToken = await loginAction({ email: email.trim(), password })
      setSession(env.defaultApiUrl, accessToken)
      navigate('/overview', { replace: true })
    } catch (err) {
      setError(errorMessage(err, t.auth.signInFailed))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signInTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.auth.signInSubtitle}</p>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t.auth.signingIn : t.auth.signIn}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {t.auth.noAccountYet}{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          {t.auth.createOne}
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        <Link to="/docs" className="font-medium text-primary hover:underline">
          {t.auth.readTheDocs}
        </Link>
      </p>
    </form>
  )
}
