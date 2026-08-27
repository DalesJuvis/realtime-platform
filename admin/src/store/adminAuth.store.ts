/**
 * # AdminAuthStore
 *
 * Holds which engine instance's Admin API this app talks to and the bearer
 * token for it. Persisted key: `adminAuth-storage`. There is no login
 * endpoint on this backend (`AdminTokenGuard` checks a single static
 * `ADMIN_API_TOKEN` — same token for every caller, valid against exactly
 * one instance) and so no way to validate a token except by trying a real
 * admin call; `connect()` just stores it, and `http.ts`'s 401 interceptor
 * calls `logout()` the first time a call proves it wrong.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AdminConnection } from '@entities/AdminAuth.entity'

interface AdminAuthState {
  readonly apiUrl: string | null
  readonly token: string | null
  readonly isAuthenticated: boolean

  connect: (connection: AdminConnection) => void
  logout: () => void
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      apiUrl: null,
      token: null,
      isAuthenticated: false,

      connect: ({ apiUrl, token }) => set({ apiUrl, token, isAuthenticated: true }),

      logout: () => set({ apiUrl: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'adminAuth-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
