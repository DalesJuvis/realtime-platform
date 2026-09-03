/**
 * # NotificationBell
 *
 * Global notification bell — mounted once in `AppSidebar` (desktop) and
 * once in `MobileHeader` (mobile, where the sidebar is an off-canvas
 * drawer, not always on screen), so it's reachable on every page. Backed
 * by the tenant's persisted notification feed (`GET
 * /api/v1/portal/notifications`), not the browser's own Web Push
 * subscription (`VapidKeyCard`/`registerPortalPushAction`) — this shows
 * every message published to the tenant's channels, whether or not this
 * browser ever subscribed to push at all.
 *
 * Polls on an interval rather than pushing over the already-open
 * WebSocket: `PresenceService`'s connection is scoped to whatever the
 * current page happens to subscribe to, not a tenant-wide firehose, and
 * standing up a second always-on subscription just for this badge isn't
 * worth it next to a cheap periodic refetch.
 */

import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { Button } from '@components/ui/button'
import { Badge } from '@components/ui/badge'
import { useTranslation } from '@lib/i18n'
import { errorMessage } from '@lib/errors'
import { formatDateTime, cn } from '@lib/utils'
import { getNotificationsAction } from '@actions/notifications/getNotifications.action'
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@actions/notifications/markNotificationRead.action'
import type { Notification } from '@entities/Notification.entity'

const POLL_INTERVAL_MS = 20_000

interface NotificationBellProps {
  triggerClassName?: string
  /** Which side of the trigger the panel opens on — `AppSidebar` passes
   * `"right"` so the panel sits beside the sidebar rather than dropping
   * down over its own nav items; `MobileHeader` leaves this at the
   * default (`"bottom"`, Radix's own default), the natural direction for
   * a trigger already at the top of the screen. */
  contentSide?: 'top' | 'right' | 'bottom' | 'left'
  contentAlign?: 'start' | 'center' | 'end'
}

export function NotificationBell({
  triggerClassName,
  contentSide,
  contentAlign = 'end',
}: NotificationBellProps = {}) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const list = await getNotificationsAction()
      setItems(list.items)
      setUnreadCount(list.unread_count)
    } catch {
      // Silent on the periodic poll — a toast every 20s for a transient
      // network blip would be worse than just trying again next tick.
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  async function handleMarkRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
    try {
      await markNotificationReadAction(id)
    } catch (err) {
      toast.error(errorMessage(err, t.notificationBell.markReadFailed))
      refresh()
    }
  }

  async function handleMarkAllRead() {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })))
    setUnreadCount(0)
    try {
      await markAllNotificationsReadAction()
    } catch (err) {
      toast.error(errorMessage(err, t.notificationBell.markAllReadFailed))
      refresh()
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && refresh()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative active:bg-accent', triggerClassName)}
          aria-label={unreadCount > 0 ? t.notificationBell.unreadAriaLabel(unreadCount) : t.notificationBell.bellAriaLabel}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 py-0 text-[10px] leading-none"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        {...(contentSide ? { side: contentSide } : {})}
        align={contentAlign}
        sideOffset={contentSide === 'right' ? 12 : 4}
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">{t.notificationBell.title}</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={handleMarkAllRead}>
              {t.notificationBell.markAllRead}
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm font-medium">{t.notificationBell.empty}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.notificationBell.emptyDescription}</p>
          </div>
        ) : (
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={(e) => {
                  e.preventDefault()
                  if (!n.read_at) handleMarkRead(n.id)
                }}
                className={cn('flex-col items-start gap-0.5 whitespace-normal py-2', !n.read_at && 'bg-primary/5')}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                  <span className="truncate font-mono text-xs text-muted-foreground">{n.channel_id}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                </div>
                <p className={cn('w-full truncate text-sm', !n.read_at && 'font-medium')}>{n.payload}</p>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
