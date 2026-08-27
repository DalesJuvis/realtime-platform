/**
 * # PreferencesProvider
 *
 * Reads PreferencesStore and applies dark/light/system class on <html>, plus
 * derives `--primary`/`--ring` from the chosen accent color so the picker in
 * Settings actually changes the app's primary color (not just a stored hex
 * nothing reads). `overlayBlur` is consumed directly by `DialogOverlay`/
 * `SheetOverlay` instead of a CSS variable, since toggling a Tailwind
 * `backdrop-blur` utility conditionally is simplest done in JS. Must wrap the
 * app inside <RouterProvider>.
 */

import { useEffect } from 'react'
import { usePreferencesStore } from '@store/preferences.store'
import { hexToHslTriplet } from '@lib/color'

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const theme = usePreferencesStore((s) => s.theme)
  const accentColor = usePreferencesStore((s) => s.accentColor)

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

  useEffect(() => {
    const root = document.documentElement
    const hsl = hexToHslTriplet(accentColor)
    root.style.setProperty('--accent-user', accentColor)
    root.style.setProperty('--primary', hsl)
    root.style.setProperty('--ring', hsl)
  }, [accentColor])

  return <>{children}</>
}
