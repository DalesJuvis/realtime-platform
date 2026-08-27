/**
 * # AppSidebar
 *
 * The tenant workspace's navigation — Overview (dashboard metrics),
 * Channels, Broadcasting, Templates, Settings (which folds in the former
 * standalone Devices view as a "connected sessions" section).
 */

import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Hash, Send, FileText, Settings, LogOut } from 'lucide-react'
import { cn } from '@lib/utils'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { Button } from '@components/ui/button'

const NAV = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/channels', label: 'Channels', icon: Hash },
  { to: '/broadcasting', label: 'Broadcasting', icon: Send },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppSidebar() {
  const email = usePortalAuthStore((s) => s.email)
  const tenantId = usePortalAuthStore((s) => s.tenantId)
  const logout = usePortalAuthStore((s) => s.logout)

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          R
        </div>
        <span className="truncate font-semibold tracking-tight">Workspace</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-medium">{email}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{tenantId}</p>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
