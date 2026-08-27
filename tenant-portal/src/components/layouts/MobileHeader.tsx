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

export function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
      <Button variant="ghost" size="icon" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
      <MioLogo className="h-6 w-6 shrink-0" />
      <span className="font-semibold tracking-tight">mio</span>
    </div>
  )
}
