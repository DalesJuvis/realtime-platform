import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { WorkspaceBanner } from './WorkspaceBanner'
import { MobileHeader } from './MobileHeader'
import { DevToolbar } from './DevToolbar'

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-svh flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <WorkspaceBanner />
          <MobileHeader onOpenMenu={() => setMobileNavOpen(true)} />
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
