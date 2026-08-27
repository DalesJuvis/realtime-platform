/**
 * # useClickOutside
 *
 * Calls `onOutside` when a pointer event lands outside the given ref's
 * element — powers the lightweight anchored dropdowns in `AdminTopBar`
 * (search results, notifications, setup guide) without pulling in a full
 * popover/floating-ui dependency for what's otherwise a plain absolutely
 * positioned panel.
 */

import { useEffect, type RefObject } from 'react'

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    function handlePointerDown(e: PointerEvent) {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        onOutside()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
