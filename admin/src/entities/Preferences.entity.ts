/**
 * # UserPreferencesEntity
 *
 * UI preference state controlled by the admin. Persisted to localStorage key
 * `user-preferences`. Scoped down from FRONTEND.md §17's generic template
 * (no `locale`/`displayMode` — this is a single-locale, table-only admin tool).
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export interface UserPreferencesEntity {
  readonly theme: ThemeMode
  readonly overlayBlur: boolean
  readonly accentColor: string
}

export const DEFAULT_PREFERENCES: UserPreferencesEntity = {
  theme: 'system',
  overlayBlur: true,
  accentColor: '#6366f1',
}
