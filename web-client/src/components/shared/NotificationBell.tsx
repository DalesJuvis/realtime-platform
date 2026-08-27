/**
 * # NotificationBell
 *
 * Header icon opening a Sheet with recent cross-channel notifications
 * (messages received while another channel was active). Marks everything
 * read on open.
 */

import { Bell } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Badge } from '@components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@components/ui/sheet'
import { ScrollArea } from '@components/ui/scroll-area'
import { useNotifications } from '@hooks/notifications/useNotifications'

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function NotificationBell() {
  const { items, unreadCount, markAllRead } = useNotifications()

  return (
    <Sheet onOpenChange={(open) => open && markAllRead()}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <ul className="flex flex-col gap-1 p-4">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">#{item.channelId}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(item.createdAt)}</span>
                </div>
                <p className="mt-1 truncate text-muted-foreground">{item.preview}</p>
              </li>
            ))}
            {items.length === 0 && <p className="p-3 text-sm text-muted-foreground">No notifications yet.</p>}
          </ul>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
