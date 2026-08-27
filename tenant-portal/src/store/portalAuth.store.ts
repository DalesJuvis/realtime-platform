/**
 * # PortalAuthStore
 *
 * Holds which engine instance's Portal API this app talks to and the
 * signed-in tenant's session. Persisted key: `portalAuth-storage`.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { decodeSessionPayload } from '@lib/decodeSession'

interface PortalAuthState {
  readonly apiUrl: string | null
  readonly accessToken: string | null
  readonly tenantId: string | null
  readonly email: string | null
  readonly expiresAt: string | null
  readonly isAuthenticated: boolean

  setSession: (apiUrl: string, accessToken: string) => void
  logout: () => void
}

export const usePortalAuthStore = create<PortalAuthState>()(
  persist(
    (set) => ({
      apiUrl: null,
      accessToken: null,
      tenantId: null,
      email: null,
      expiresAt: null,
      isAuthenticated: false,

      setSession: (apiUrl, accessToken) => {
        const claims = decodeSessionPayload(accessToken)
        set({
          apiUrl,
          accessToken,
          tenantId: claims.tenant_id,
          email: claims.email,
          expiresAt: new Date(claims.exp * 1000).toISOString(),
          isAuthenticated: true,
        })
      },

      logout: () =>
        set({
          apiUrl: null,
          accessToken: null,
          tenantId: null,
          email: null,
          expiresAt: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'portalAuth-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
