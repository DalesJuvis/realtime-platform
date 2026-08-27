/**
 * # WorkspaceBanner
 *
 * Full-width dark top bar, same chrome as saas-admin's `EnvironmentBanner` —
 * but adapted honestly rather than ported literally: this platform has no
 * sandbox/live payment-mode concept (a broadcast always reaches real
 * subscribers, there's no test mode), so the risky-vs-safe framing doesn't
 * apply. What genuinely matters here is which backend deployment this
 * build talks to — especially since the API URL is no longer visible
 * anywhere in the auth forms (see `SignupForm`/`LoginForm`). `VITE_APP_ENV`
 * drives the badge; `development`/`staging` read as neutral, `production`
 * reads as a caution, since broadcasts there really do reach real clients.
 */

import { Badge } from '@components/ui/badge'
import { env } from '@lib/env'

export function WorkspaceBanner() {
  const isProduction = env.appEnv === 'production'
  const host = (() => {
    try {
      return new URL(env.defaultApiUrl).host
    } catch {
      return env.defaultApiUrl
    }
  })()

  return (
    <div
      className={
        isProduction
          ? 'flex w-full flex-wrap items-center justify-center gap-2 bg-red-950 px-4 py-2 text-center text-sm text-red-50 sm:gap-3'
          : 'flex w-full flex-wrap items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-center text-sm text-slate-100 sm:gap-3'
      }
    >
      <Badge variant={isProduction ? 'destructive' : 'neutral'} className="shrink-0 capitalize">
        {env.appEnv}
      </Badge>
      <span>
        {isProduction
          ? `Connected to ${host} — broadcasts here reach real subscribers.`
          : `Connected to ${host} in the ${env.appEnv} environment.`}
      </span>
    </div>
  )
}
