/**
 * # ConnectedRoute
 *
 * Redirects to `/` (connect screen) unless a connection has been
 * established or is in flight.
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useConnectionStore } from '@store/connection.store'

export function ConnectedRoute() {
  const status = useConnectionStore((s) => s.status)

  if (status === 'idle') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
