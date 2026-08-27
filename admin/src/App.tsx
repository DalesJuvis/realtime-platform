/**
 * # App
 *
 * Root component: wraps the router in PreferencesProvider (theme/overlay CSS
 * vars), DialogProvider (global dialog stack), and a single app-wide
 * TooltipProvider — every `<Tooltip>` in the app relies on this one ancestor
 * rather than each component wrapping its own (Radix's `Tooltip.Root`
 * throws if no `TooltipProvider` is present anywhere above it).
 */

import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@components/ui/sonner'
import { TooltipProvider } from '@components/ui/tooltip'
import { PreferencesProvider } from '@providers/PreferencesProvider'
import { DialogProvider } from '@providers/DialogProvider'
import { router } from '@router/index'

function App() {
  return (
    <PreferencesProvider>
      <TooltipProvider delayDuration={200}>
        <DialogProvider>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </DialogProvider>
      </TooltipProvider>
    </PreferencesProvider>
  )
}

export default App
