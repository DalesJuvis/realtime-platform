/**
 * # OnboardingStore
 *
 * Persisted dismiss state for `OverviewPage`'s "Setup guide" card.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface OnboardingState {
  readonly setupGuideDismissed: boolean
  dismissSetupGuide: () => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      setupGuideDismissed: false,
      dismissSetupGuide: () => set({ setupGuideDismissed: true }),
    }),
    {
      name: 'onboarding-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
