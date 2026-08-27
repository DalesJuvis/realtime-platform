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
