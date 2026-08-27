/**
 * # AdminSidebar
 *
 * Fixed left navigation — three routes total, this app has nothing else to
 * navigate to (see `router/index.tsx`). Collapsible to an icon-only rail
 * via `useUiStore`'s `sidebarOpen` flag.
 */

import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, FlaskConical, Settings, LogOut, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@lib/utils'
import { useAdminAuthStore } from '@store/adminAuth.store'
import { useUiStore } from '@store/ui.store'
import { Button } from '@components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/tenants', label: 'Tenants', icon: Building2, end: false },
  { to: '/admin/sandbox', label: 'Sandbox', icon: FlaskConical, end: false },
  { to: '/admin/settings', label: 'Settings', icon: Settings, end: false },
]

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
}: {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end: boolean
  collapsed: boolean
}) {
  const link = (
    <NavLink
      to={to}
      end={end}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && label}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function AdminSidebar() {
  const apiUrl = useAdminAuthStore((s) => s.apiUrl)
  const logout = useAdminAuthStore((s) => s.logout)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const collapsed = !sidebarOpen

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className={cn('flex items-center gap-2 px-5 py-5', collapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          R
        </div>
        {!collapsed && <span className="truncate font-semibold tracking-tight">Realtime Admin</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {!collapsed && apiUrl && <p className="truncate px-2 pb-2 text-xs text-muted-foreground">{apiUrl}</p>}
        <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between px-2')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="Disconnect">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
