import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import { router } from '@router/index'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster richColors position="top-right" />
  </StrictMode>,
)

// Registers the PWA/push service worker unconditionally at startup —
// `PushNotificationToggle` only *subscribes* to push on it later, but the
// worker itself (offline shell + `push`/`notificationclick` handlers,
// see `public/sw.js`) needs to be active regardless, for installability.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('Service worker registration failed:', err)
    })
  })
}
