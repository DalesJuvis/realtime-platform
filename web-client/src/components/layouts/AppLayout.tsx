/**
 * # AppLayout
 *
 * Responsive shell: a static sidebar on desktop (`md:` and up), collapsed
 * into a Sheet drawer triggered by a hamburger button on mobile. Children
 * render as the main content pane.
 */

import { type ReactNode, useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@components/ui/sheet'
import { ChannelList } from '@modules/chat/components/ChannelList'
import { NotificationBell } from '@components/shared/NotificationBell'
import { PushNotificationToggle } from '@components/shared/PushNotificationToggle'
import { env } from '@lib/env'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r md:flex md:flex-col">
        <ChannelList />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-3 py-2 md:hidden">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Channels</SheetTitle>
              </SheetHeader>
              <ChannelList onChannelSelected={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold">{env.appName}</span>
          <div className="flex items-center">
            <PushNotificationToggle />
            <NotificationBell />
          </div>
        </header>

        <div className="hidden items-center justify-end gap-1 border-b px-4 py-2 md:flex">
          <PushNotificationToggle />
          <NotificationBell />
        </div>

        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
