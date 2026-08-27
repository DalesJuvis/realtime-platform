import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AuthLayout } from '@components/layouts/AuthLayout'
import { AppLayout } from '@components/layouts/AppLayout'
import { ProtectedRoute } from './guards/ProtectedRoute'
import RegisterPage from '@modules/auth/pages/RegisterPage'
import JoinPage from '@modules/auth/pages/JoinPage'
import LoginPage from '@modules/auth/pages/LoginPage'
import OverviewPage from '@modules/overview/pages/OverviewPage'
import ChannelsPage from '@modules/channels/pages/ChannelsPage'
import BroadcastingPage from '@modules/broadcasting/pages/BroadcastingPage'
import TemplatesPage from '@modules/templates/pages/TemplatesPage'
import SettingsPage from '@modules/settings/pages/SettingsPage'

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
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: 'overview', element: <OverviewPage /> },
          { path: 'channels', element: <ChannelsPage /> },
          { path: 'broadcasting', element: <BroadcastingPage /> },
          { path: 'templates', element: <TemplatesPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
