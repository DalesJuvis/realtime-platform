/**
 * # MintedTokenStore
 *
 * The most recently minted client token, persisted across reloads
 * (`localStorage`, same pattern as `portalAuth.store`/`ui.store`) —
 * previously plain `useState` in `OverviewPage`'s `MintTokenCard`, which
 * meant a reload silently threw away a token you'd just minted (and,
 * before this store existed, hadn't downloaded yet). Shared between
 * `OverviewPage` and `ApiKeysPage` (both render the same `MintTokenCard`):
 * minting on either page replaces this one slot, there's no concept of
 * multiple concurrently "current" tokens.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MintedCredentials } from '@entities/MintedCredentials.entity'

interface MintedTokenState {
  readonly credentials: MintedCredentials | null
  setCredentials: (credentials: MintedCredentials) => void
  clear: () => void
}

export const useMintedTokenStore = create<MintedTokenState>()(
  persist(
    (set) => ({
      credentials: null,
      setCredentials: (credentials) => set({ credentials }),
      clear: () => set({ credentials: null }),
    }),
    {
      name: 'minted-token-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
