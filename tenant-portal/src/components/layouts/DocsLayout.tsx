/**
 * # DocsLayout
 *
 * Standalone chrome for `/docs` — deliberately outside `ProtectedRoute`:
 * docs need to be readable by someone deciding whether to sign up, not
 * just existing tenants, so this route carries its own minimal header
 * instead of `AppLayout`'s full (auth-only) sidebar. Signed-in users
 * reaching this from the sidebar's "Docs" link leave that chrome behind
 * temporarily — "Back to app" below returns them; logged-out visitors get
 * "Log in" instead.
 */

import { Link, Outlet } from 'react-router-dom'
import { MioLogo } from '@components/shared/MioLogo'
import { usePortalAuthStore } from '@store/portalAuth.store'

export function DocsLayout() {
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <MioLogo className="h-7 w-7 shrink-0" />
            <span className="font-semibold tracking-tight">mio</span>
          </Link>
          <Link to={isAuthenticated ? '/overview' : '/login'} className="text-sm font-medium text-primary hover:underline">
            {isAuthenticated ? '← Back to app' : 'Log in →'}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
