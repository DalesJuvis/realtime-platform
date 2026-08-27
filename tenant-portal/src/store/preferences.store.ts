/**
 * # PreferencesStore
 *
 * Persisted theme preference — synced to `localStorage` under
 * `user-preferences`. Consumed by `PreferencesProvider` to toggle the
 * `.dark`/`.light` class on `<html>`.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

interface PreferencesState {
  readonly theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'user-preferences',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
