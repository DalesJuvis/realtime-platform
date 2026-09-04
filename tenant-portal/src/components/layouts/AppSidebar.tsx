/**
 * # AppSidebar
 *
 * Fixed left navigation, cloned from saas-admin's `PortalSidebar` (the
 * self-service tenant sidebar, not the admin-impersonation one) — logo,
 * "Your account" nav section, collapsible to an icon-only rail via
 * `useUiStore`'s `sidebarOpen` flag, an environment indicator box above the
 * footer, and a bottom account chip with collapse/sign-out controls.
 *
 * `PortalSidebar`'s "Mode" box is a real Sandbox/Production *toggle* there
 * (switching purges sandbox test data via a confirm dialog) — this platform
 * has no sandbox mode to switch into, so the same segmented-pill visual is
 * reproduced but disabled (a tooltip explains it's fixed by `VITE_APP_ENV`
 * at build time) rather than wiring up a control with nothing behind it.
 *
 * Below `lg` there's no room for a persistent rail, so the same element
 * doubles as an off-canvas drawer: `mobileOpen`/`onMobileClose` (owned by
 * `AppLayout`, opened via `MobileHeader`'s hamburger) drive a translate-x
 * transform + backdrop, while `lg:` variants override back to the normal
 * in-flow desktop sidebar. The desktop icon-only collapse and the mobile
 * open/closed state are independent — a drawer that's merely an icon rail
 * would defeat the point of it, so content decisions use `iconOnly`
 * (`collapsed && !mobileOpen`), while only the outer width classes key off
 * raw `collapsed` (itself `lg:`-scoped, so irrelevant off-canvas anyway).
 */

import { NavLink, useLocation, matchPath } from 'react-router-dom'
import {
  LayoutDashboard,
  Hash,
  Send,
  FileText,
  FileBarChart,
  KeyRound,
  Receipt,
  Repeat,
  Link2,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  X,
  BookOpen,
  Smartphone,
  Wand2,
} from 'lucide-react'
import { cn } from '@lib/utils'
import { env } from '@lib/env'
import { useTranslation } from '@lib/i18n'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { useUiStore } from '@store/ui.store'
import { Button } from '@components/ui/button'
import { Badge } from '@components/ui/badge'
import { Avatar, AvatarFallback } from '@components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'
import { MioLogo } from '@components/shared/MioLogo'
import { NotificationBell } from '@components/shared/NotificationBell'

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  iconOnly,
  onNavigate,
}: {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  iconOnly: boolean
  onNavigate: () => void
}) {
  const location = useLocation()

  // Computed manually (not read off NavLink's own `isActive` render-prop)
  // so `className` below can stay a plain string. Two earlier attempts
  // both worked around Radix Slot needing that: first a `contents`-styled
  // `<a>` wrapping a real inner `<span>`, which fixed the class-merge but
  // left the tooltip's trigger anchored to a `display: contents` element
  // that Popper measures as a zero-size box (tooltip stuck at the
  // sidebar's top-left regardless of `side="right"`); then moving the
  // tooltip down onto that inner `<span>` instead. Both were patches
  // around the same root cause. Removing the function-className
  // entirely — `<NavLink>` is a completely ordinary element, `<Tooltip>`
  // can wrap it directly, and there's no zero-size node anywhere in the
  // tree for Popper to ever mismeasure.
  const isActive = matchPath({ path: to, end: end ?? false }, location.pathname) !== null

  const link = (
    <NavLink
      to={to}
      end={end ?? false}
      onClick={onNavigate}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        iconOnly && 'justify-center px-0',
        isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
      {!iconOnly && label}
    </NavLink>
  )

  if (!iconOnly) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function initialsOf(email: string | null): string {
  if (!email) return '?'
  return email.slice(0, 2).toUpperCase()
}

export function AppSidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  const { t } = useTranslation()
  const email = usePortalAuthStore((s) => s.email)
  const tenantId = usePortalAuthStore((s) => s.tenantId)
  const logout = usePortalAuthStore((s) => s.logout)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const focusMode = useUiStore((s) => s.focusMode)
  const collapsed = !sidebarOpen
  const iconOnly = collapsed && !mobileOpen
  const isProduction = env.appEnv === 'production'

  const NAV = [
    { to: '/overview', label: t.nav.overview, icon: LayoutDashboard, end: true },
    { to: '/channels', label: t.nav.channels, icon: Hash },
    { to: '/broadcasting', label: t.nav.broadcasting, icon: Send },
    { to: '/templates', label: t.nav.templates, icon: FileText },
    { to: '/keys', label: t.nav.apiKeys, icon: KeyRound },
    { to: '/devices', label: t.nav.devices, icon: Smartphone },
    { to: '/embed', label: t.nav.embed, icon: Wand2 },
    { to: '/billing', label: t.nav.billing, icon: Receipt },
    { to: '/subscriptions', label: t.nav.subscriptions, icon: Repeat },
    { to: '/checkout', label: t.nav.checkout, icon: Link2 },
    { to: '/reports', label: t.nav.reports, icon: FileBarChart },
    { to: '/docs', label: t.nav.docs, icon: BookOpen },
    { to: '/settings', label: t.nav.settings, icon: Settings },
  ]

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-transform duration-200',
          'lg:static lg:inset-y-auto lg:z-auto lg:translate-x-0 lg:transition-[width,opacity,border-color] lg:duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-16' : 'lg:w-60',
          // Overview's focus mode (`useUiStore.focusMode`) collapses the
          // sidebar further still, to nothing — beyond the icon-only rail
          // `collapsed` alone gives, since the point is showing metrics
          // and nothing else. Ordered after `collapsed`'s width classes so
          // `cn`'s `twMerge` lets this one win when both are true.
          focusMode && 'lg:w-0 lg:border-r-0 lg:opacity-0',
        )}
      >
        <div className={cn('flex items-center gap-2 px-5 py-5', iconOnly && 'justify-center px-0')}>
          <MioLogo className="h-8 w-8 shrink-0" />
          {!iconOnly && <span className="truncate text-lg font-semibold tracking-tight">mio</span>}
          {!iconOnly && (
            <div className="ml-auto hidden lg:block">
              <NotificationBell contentSide="right" contentAlign="start" />
            </div>
          )}
          {mobileOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden"
              onClick={onMobileClose}
              aria-label={t.nav.closeMenu}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <nav className="scrollbar-thin flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2 py-2">
          {!iconOnly && (
            <p className="truncate px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              {t.nav.accountSection}
            </p>
          )}
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} iconOnly={iconOnly} onNavigate={onMobileClose} />
          ))}
        </nav>

        <div className="mx-3 mb-3">
          {iconOnly ? (
          <div className="flex justify-center">
            <Badge variant={isProduction ? 'destructive' : 'warning'}>{isProduction ? 'P' : 'D'}</Badge>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t.nav.environment}</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex gap-1 rounded-md border border-border bg-background p-1">
                  <span
                    className={cn(
                      'flex-1 rounded-sm px-2 py-1 text-center text-xs font-medium transition-colors',
                      !isProduction
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {t.nav.environmentDevelopment}
                  </span>
                  <span
                    className={cn(
                      'flex-1 rounded-sm px-2 py-1 text-center text-xs font-medium transition-colors',
                      isProduction
                        ? 'bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {t.nav.environmentProduction}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">{t.nav.environmentFixedTooltip}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        {iconOnly ? (
          <div className="flex flex-col items-center gap-2">
            <NotificationBell contentSide="right" contentAlign="start" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initialsOf(email)}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="right">{email}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label={t.nav.expandSidebar}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t.nav.expandSidebar}</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon" onClick={logout} aria-label={t.nav.signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-2 pb-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initialsOf(email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{email}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{tenantId}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="flex-1 justify-start" onClick={logout}>
                <LogOut className="h-4 w-4" />
                {t.nav.signOut}
              </Button>
              <div className="hidden lg:block">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label={t.nav.collapseSidebar}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t.nav.collapseSidebar}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </>
        )}
      </div>
      </aside>
    </>
  )
}
