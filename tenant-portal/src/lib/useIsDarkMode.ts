import { useSyncExternalStore } from 'react'

const root = document.documentElement

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(root, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/**
 * # useIsDarkMode
 *
 * Reads the `dark`/`light` class `PreferencesProvider` already applies to
 * `<html>` — the resolved theme (its "system" setting is resolved to one
 * of those two classes there), not a second copy of the resolution logic.
 * Used to pick TinyMCE's skin/content CSS, which can't follow Tailwind's
 * `dark:` classes since its content renders inside its own iframe.
 */
export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribe, () => root.classList.contains('dark'))
}
