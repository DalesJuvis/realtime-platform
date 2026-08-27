/**
 * # PreferencesProvider
 *
 * Reads `PreferencesStore` and applies the `dark`/`light` class on
 * `<html>` — what `DevToolbar`'s theme toggle actually changes. Must wrap
 * the app inside `<RouterProvider>`.
 */

import { useEffect } from 'react'
import { usePreferencesStore } from '@store/preferences.store'

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const theme = usePreferencesStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.add(prefersDark ? 'dark' : 'light')
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  return <>{children}</>
}
