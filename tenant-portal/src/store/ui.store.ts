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

  /**
   * Kiosk/TV-style "just the metrics" view (`OverviewPage`'s focus-mode
   * toggle) — animates away the sidebar, top banner/mobile header, and
   * `OverviewPage`'s own right rail, all read from here since they live in
   * `AppLayout`/`AppSidebar`, above the page itself in the tree. Not
   * persisted (`partialize` below): unlike `sidebarOpen`, coming back to a
   * reload with the whole nav chrome silently gone would be confusing
   * rather than a convenience worth remembering.
   */
  readonly focusMode: boolean
  toggleFocusMode: () => void
  setFocusMode: (focusMode: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      pageSize: 10,
      setPageSize: (pageSize) => set({ pageSize }),

      focusMode: false,
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      setFocusMode: (focusMode) => set({ focusMode }),
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen, pageSize: state.pageSize }),
    },
  ),
)
