/**
 * # MobileHeader
 *
 * Slim bar shown only below `lg` — `AppSidebar` becomes an off-canvas
 * drawer at that width (there's no room for a persistent rail on a phone),
 * so this is what actually opens it. Hidden entirely on `lg`+, where the
 * sidebar is back to being permanently in-flow.
 */

import { Menu } from 'lucide-react'
import { Button } from '@components/ui/button'
import { MioLogo } from '@components/shared/MioLogo'
import { NotificationBell } from '@components/shared/NotificationBell'

// `h-11 w-11` (44px) on both tappable icons, not the shared `size="icon"`
// default (36px) — below Apple/Material's ~44px minimum touch target,
// fine with a mouse but a real miss-tap risk with a thumb. `active:` (not
// just `hover:`) gives visible press feedback on touch, where hover can
// linger stuck or never fire at all.
const TOUCH_TARGET = 'h-11 w-11 active:bg-accent'

export function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-2 border-b border-border bg-card px-2 py-2 lg:hidden">
      <Button variant="ghost" size="icon" className={TOUCH_TARGET} onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
      <MioLogo className="h-6 w-6 shrink-0" />
      <span className="truncate font-semibold tracking-tight">mio</span>
      <div className="ml-auto">
        <NotificationBell triggerClassName={TOUCH_TARGET} />
      </div>
    </div>
  )
}
