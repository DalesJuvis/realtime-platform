/**
 * # PreferencesStore
 *
 * Persisted Zustand store for UI preferences. Syncs to localStorage key
 * `user-preferences` automatically.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { DEFAULT_PREFERENCES, type UserPreferencesEntity, type ThemeMode } from '@entities/Preferences.entity'

interface PreferencesState extends UserPreferencesEntity {
  setTheme: (theme: ThemeMode) => void
  setOverlayBlur: (enabled: boolean) => void
  setAccentColor: (hex: string) => void
  reset: () => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    immer((set) => ({
      ...DEFAULT_PREFERENCES,
      setTheme: (theme) =>
        set((s) => {
          s.theme = theme
        }),
      setOverlayBlur: (enabled) =>
        set((s) => {
          s.overlayBlur = enabled
        }),
      setAccentColor: (hex) =>
        set((s) => {
          s.accentColor = hex
        }),
      reset: () => set(() => ({ ...DEFAULT_PREFERENCES })),
    })),
    {
      name: 'user-preferences',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
