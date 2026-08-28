import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { WorkspaceBanner } from './WorkspaceBanner'
import { MobileHeader } from './MobileHeader'
import { DevToolbar } from './DevToolbar'
import { cn } from '@lib/utils'
import { useUiStore } from '@store/ui.store'

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const focusMode = useUiStore((s) => s.focusMode)

  return (
    <div className="flex h-svh flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* `max-height` (not `hidden`/unmount) is what makes this an
              animated collapse rather than an instant jump — see
              `OverviewPage`'s focus-mode toggle, the only thing that
              flips `focusMode`. */}
          <div
            className={cn(
              'shrink-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out',
              focusMode ? 'max-h-0 opacity-0' : 'max-h-24 opacity-100',
            )}
          >
            <WorkspaceBanner />
          </div>
          <div
            className={cn(
              'shrink-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out',
              focusMode ? 'max-h-0 opacity-0' : 'max-h-16 opacity-100',
            )}
          >
            <MobileHeader onOpenMenu={() => setMobileNavOpen(true)} />
          </div>
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <DevToolbar />
    </div>
  )
}
