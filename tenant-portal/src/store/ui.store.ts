/**
 * # UiStore
 *
 * Persisted UI chrome state — sidebar collapse (defaults to expanded) and
 * `DataTable`'s default rows-per-page (defaults to 10, editable in
 * Settings → Preferences) — both remembered across reloads via
 * `localStorage`. Client-side only, unlike saas-admin's equivalent
 * (`tenant.page_size`, synced server-side): this is a per-browser UI
 * convenience, not something that needs to follow the tenant across devices.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface UiState {
  readonly sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  readonly pageSize: number
  setPageSize: (pageSize: number) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      pageSize: 10,
      setPageSize: (pageSize) => set({ pageSize }),
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
