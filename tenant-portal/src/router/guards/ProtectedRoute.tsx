import { Navigate, Outlet } from 'react-router-dom'
import { usePortalAuthStore } from '@store/portalAuth.store'

export function ProtectedRoute() {
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
