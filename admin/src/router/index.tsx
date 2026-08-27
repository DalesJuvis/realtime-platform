/**
 * # Router
 *
 * Three real pages behind `ProtectedRoute` (Dashboard, Tenants, Settings)
 * plus the single unauthenticated `/login` — this app talks to exactly one
 * backend surface (the Admin API), so there is nothing else to route to.
 */

import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ProtectedRoute } from './guards/ProtectedRoute'
import { AuthLayout } from '@components/layouts/AuthLayout'
import { AdminLayout } from '@components/layouts/AdminLayout'
import { PageLoader } from '@components/shared/PageLoader'

const LoginPage = lazy(() => import('@modules/auth/pages/LoginPage'))
const DashboardPage = lazy(() => import('@modules/dashboard/pages/DashboardPage'))
const TenantsPage = lazy(() => import('@modules/tenants/pages/TenantsPage'))
const AdminSettingsPage = lazy(() => import('@modules/settings/pages/AdminSettingsPage'))
const NotFoundPage = lazy(() => import('@modules/common/pages/NotFoundPage'))
const RouteErrorPage = lazy(() => import('@modules/common/pages/RouteErrorPage'))

function withSuspense(Component: React.LazyExoticComponent<() => React.JSX.Element>) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace />, errorElement: withSuspense(RouteErrorPage) },
  {
    path: '/',
    element: <AuthLayout />,
    errorElement: withSuspense(RouteErrorPage),
    children: [{ path: 'login', element: withSuspense(LoginPage) }],
  },
  {
    path: '/admin',
    element: <ProtectedRoute />,
    errorElement: withSuspense(RouteErrorPage),
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: withSuspense(DashboardPage) },
          { path: 'tenants', element: withSuspense(TenantsPage) },
          { path: 'settings', element: withSuspense(AdminSettingsPage) },
        ],
      },
    ],
  },
  { path: '*', element: withSuspense(NotFoundPage) },
])
