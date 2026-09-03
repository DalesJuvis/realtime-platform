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
import { useTranslation } from '@lib/i18n'

export function RegisterForm() {
  const { t } = useTranslation()
  const setSession = usePortalAuthStore((s) => s.setSession)
  const navigate = useNavigate()

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
    try {
      // `registerAction` reads `apiUrl` from this store via the `http`
      // interceptor, so it has to land there before the call, not after.
      usePortalAuthStore.setState({ apiUrl: env.defaultApiUrl })
      const accessToken = await registerAction({ tenantId: tenantId.trim(), secret, email: email.trim(), password })
      setSession(env.defaultApiUrl, accessToken)
      navigate('/overview', { replace: true })
    } catch (err) {
      setError(errorMessage(err, t.auth.joinFailed))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.joinTenantTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.auth.joinTenantSubtitle}</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tenantId">{t.auth.tenantId}</Label>
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
          <Label htmlFor="secret">{t.auth.tenantSecret}</Label>
          <Input
            id="secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={t.auth.tenantSecretPlaceholder}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t.auth.email}</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t.auth.password}</Label>
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
        {isSubmitting ? t.auth.joining : t.auth.joinTenant}
      </Button>

      <div className="space-y-1 text-center text-xs text-muted-foreground">
        <p>
          {t.auth.alreadyHaveAccount}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t.auth.signIn}
          </Link>
        </p>
        <p>
          {t.auth.newToThePlatform}{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            {t.auth.createAWorkspace}
          </Link>
        </p>
      </div>
    </form>
  )
}
