/**
 * # ProtectedRoute
 *
 * Redirects to `/login` unless an Admin API URL + token are stored. Does
 * not verify the token works — see `adminAuth.store.ts`.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdminAuthStore } from '@store/adminAuth.store'

export function ProtectedRoute() {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
