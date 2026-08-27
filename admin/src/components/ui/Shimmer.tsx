/**
 * # Shimmer
 *
 * Base animated shimmer block. Used as the building block for all skeleton
 * variants (see `Skeleton.tsx`). Per FRONTEND.md §16 — every loading state
 * uses a shimmer skeleton, never a spinner alone.
 * Input:  className? (override width/height), rounded?
 * Output: Animated shimmer div
 */

import { cn } from '@lib/utils'

interface ShimmerProps {
  className?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

export function Shimmer({ className, rounded = 'md' }: ShimmerProps) {
  const radiusMap = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  }

  return (
    <div className={cn('relative overflow-hidden bg-muted', radiusMap[rounded], className)} aria-hidden="true">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
    </div>
  )
}
