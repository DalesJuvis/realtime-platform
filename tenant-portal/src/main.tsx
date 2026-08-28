import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import { router } from '@router/index'
import { TooltipProvider } from '@components/ui/tooltip'
import { DialogProvider } from '@providers/DialogProvider'
import { PreferencesProvider } from '@providers/PreferencesProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <TooltipProvider delayDuration={200}>
        <DialogProvider>
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" />
        </DialogProvider>
      </TooltipProvider>
    </PreferencesProvider>
  </StrictMode>,
)

// Registers the PWA offline-shell worker (see public/sw.js) — installable
// on its own; no push subscription wired here (see that file's doc
// comment for why this app doesn't need one).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('Service worker registration failed:', err)
    })
  })
}
