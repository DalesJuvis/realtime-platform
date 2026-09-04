import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AuthLayout } from '@components/layouts/AuthLayout'
import { AppLayout } from '@components/layouts/AppLayout'
import { DocsLayout } from '@components/layouts/DocsLayout'
import { ProtectedRoute } from './guards/ProtectedRoute'
import RegisterPage from '@modules/auth/pages/RegisterPage'
import JoinPage from '@modules/auth/pages/JoinPage'
import LoginPage from '@modules/auth/pages/LoginPage'
import OverviewPage from '@modules/overview/pages/OverviewPage'
import ChannelsPage from '@modules/channels/pages/ChannelsPage'
import BroadcastingPage from '@modules/broadcasting/pages/BroadcastingPage'
import TemplatesPage from '@modules/templates/pages/TemplatesPage'
import ApiKeysPage from '@modules/keys/pages/ApiKeysPage'
import DevicesPage from '@modules/devices/pages/DevicesPage'
import EmbedPage from '@modules/embed/pages/EmbedPage'
import BillingPage from '@modules/billing/pages/BillingPage'
import SubscriptionsPage from '@modules/subscriptions/pages/SubscriptionsPage'
import CheckoutPage from '@modules/checkout/pages/CheckoutPage'
import ReportsPage from '@modules/reports/pages/ReportsPage'
import SettingsPage from '@modules/settings/pages/SettingsPage'
import DocsPage from '@modules/docs/pages/DocsPage'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/overview" replace /> },
  {
    element: <AuthLayout />,
    children: [
      { path: 'register', element: <RegisterPage /> },
      { path: 'join', element: <JoinPage /> },
      { path: 'login', element: <LoginPage /> },
    ],
  },
  {
    // Outside ProtectedRoute deliberately — see DocsLayout's doc comment.
    element: <DocsLayout />,
    children: [{ path: 'docs', element: <DocsPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: 'overview', element: <OverviewPage /> },
          { path: 'channels', element: <ChannelsPage /> },
          { path: 'broadcasting', element: <BroadcastingPage /> },
          { path: 'templates', element: <TemplatesPage /> },
          { path: 'keys', element: <ApiKeysPage /> },
          { path: 'devices', element: <DevicesPage /> },
          { path: 'embed', element: <EmbedPage /> },
          { path: 'billing', element: <BillingPage /> },
          { path: 'subscriptions', element: <SubscriptionsPage /> },
          { path: 'checkout', element: <CheckoutPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
