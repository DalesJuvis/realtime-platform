/**
 * # PreferencesStore
 *
 * Persisted theme + language preference — synced to `localStorage` under
 * `user-preferences`. Theme is consumed by `PreferencesProvider` to
 * toggle the `.dark`/`.light` class on `<html>`; language is consumed by
 * `@lib/i18n`'s `useTranslation()` and also applied as `<html lang>` by
 * `PreferencesProvider`, for accessibility/SEO — no page reload needed
 * for either, both are plain reactive state.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Language } from '@lib/i18n'

export type ThemeMode = 'light' | 'dark' | 'system'

interface PreferencesState {
  readonly theme: ThemeMode
  readonly language: Language
  setTheme: (theme: ThemeMode) => void
  setLanguage: (language: Language) => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'en',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'user-preferences',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
