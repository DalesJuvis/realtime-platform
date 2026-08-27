/**
 * # TenantsStore
 *
 * Local registry of tenants this app knows about — the backend has no
 * listing endpoint (see `KnownTenant`'s doc comment), so this is the only
 * "list" that exists. Persisted key: `tenants-storage`, scoped per browser,
 * not per engine instance — switching `AdminAuthStore.apiUrl` does not
 * filter this list, since a tenant ID could plausibly be registered on
 * more than one instance.
 *
 * Deliberately never stores a tenant's secret — only `TenantsPage`'s
 * in-memory reveal-once dialog ever sees one, matching the backend's own
 * "shown once" contract for `TenantSecretResponse`.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { KnownTenant, RateLimitConfig, TenantId } from '@entities/Tenant.entity'

interface TenantsState {
  readonly tenants: KnownTenant[]

  add: (tenantId: TenantId, label: string, limits: RateLimitConfig | null) => void
  remove: (tenantId: TenantId) => void
  updateLimits: (tenantId: TenantId, limits: RateLimitConfig) => void
  rename: (tenantId: TenantId, label: string) => void
}

export const useTenantsStore = create<TenantsState>()(
  persist(
    (set) => ({
      tenants: [],

      add: (tenantId, label, limits) =>
        set((s) => {
          if (s.tenants.some((t) => t.tenantId === tenantId)) return s
          const entry: KnownTenant = { tenantId, label, addedAt: new Date().toISOString(), limits }
          return { tenants: [entry, ...s.tenants] }
        }),

      remove: (tenantId) => set((s) => ({ tenants: s.tenants.filter((t) => t.tenantId !== tenantId) })),

      updateLimits: (tenantId, limits) =>
        set((s) => ({
          tenants: s.tenants.map((t) => (t.tenantId === tenantId ? { ...t, limits } : t)),
        })),

      rename: (tenantId, label) =>
        set((s) => ({
          tenants: s.tenants.map((t) => (t.tenantId === tenantId ? { ...t, label } : t)),
        })),
    }),
    {
      name: 'tenants-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
