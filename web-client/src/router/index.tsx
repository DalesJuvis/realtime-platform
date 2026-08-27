import { createBrowserRouter } from 'react-router-dom'
import { ConnectPage } from '@modules/connect/pages/ConnectPage'
import { ChatPage } from '@modules/chat/pages/ChatPage'
import { ConnectedRoute } from '@router/guards/ConnectedRoute'

export const router = createBrowserRouter([
  { path: '/', element: <ConnectPage /> },
  {
    element: <ConnectedRoute />,
    children: [{ path: '/chat', element: <ChatPage /> }],
  },
])
