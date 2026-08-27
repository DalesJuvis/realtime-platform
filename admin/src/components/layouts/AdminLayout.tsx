/**
 * # AdminLayout
 *
 * Shell for every authenticated route: sidebar + top bar + scrollable
 * content. Mounted behind `ProtectedRoute`.
 */

import { Outlet } from 'react-router-dom'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopBar } from './AdminTopBar'
import { useIdleLogout } from '@hooks/useIdleLogout'

export function AdminLayout() {
  useIdleLogout()

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopBar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
