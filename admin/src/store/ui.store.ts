/**
 * # UiStore
 *
 * Persisted UI chrome state (sidebar collapse) — defaults to collapsed for a
 * first-time visitor (no stored preference yet), but once a user toggles it,
 * that choice is remembered across reloads/sessions via `localStorage`.
 * Shared by both `AdminSidebar` and `PortalSidebar`. Toasts are handled
 * directly via the `sonner` library's imperative API (`toast.success`,
 * `toast.error`) rather than a custom queue — see `components/ui/sonner.tsx`.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface UiState {
  readonly sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
