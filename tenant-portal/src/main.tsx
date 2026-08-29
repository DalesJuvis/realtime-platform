import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
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
//
// `sw.js` deliberately never calls self.skipWaiting() on its own — a new
// worker sits in the "waiting" state until promptUpdate() below tells it
// to take over, so a deploy never silently swaps the worker under an
// already-open tab without that tab's user finding out. `registration.
// waiting` covers a worker that finished installing before this page
// session even started (e.g. the tab was already open when the deploy
// landed); `updatefound` covers one that starts installing during this
// session. Either way the toast persists (duration: Infinity) until
// acted on — a silently-missed update is worse than an ignorable toast.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptUpdate(registration.waiting)
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(newWorker)
            }
          })
        })
      })
      .catch((err: unknown) => {
        console.warn('Service worker registration failed:', err)
      })
  })

  // Reloads once, when the new worker actually takes over — triggered by
  // promptUpdate()'s postMessage, never on its own.
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

function promptUpdate(waitingWorker: ServiceWorker): void {
  toast('A new version is available.', {
    id: 'sw-update-available', // re-showing this toast on a later trigger replaces it rather than stacking
    duration: Infinity,
    action: {
      label: 'Update',
      onClick: () => waitingWorker.postMessage({ type: 'SKIP_WAITING' }),
    },
  })
}
