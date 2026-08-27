/**
 * # Skeleton
 *
 * Composed shimmer skeletons matching real content shapes, per FRONTEND.md §16.2.
 */

import { Shimmer } from './Shimmer'
import { cn } from '@lib/utils'

export function SkeletonText({ className }: { className?: string }) {
  return <Shimmer className={cn('h-4 w-full', className)} />
}

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' }
  return <Shimmer className={sizeMap[size]} rounded="full" />
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border p-4 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-1/2" />
          <Shimmer className="h-3 w-1/3" />
        </div>
      </div>
      <Shimmer className="h-3 w-full" />
      <Shimmer className="h-3 w-5/6" />
      <Shimmer className="h-3 w-4/6" />
    </div>
  )
}

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Shimmer className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </>
  )
}

export function SkeletonField({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Shimmer className="h-4 w-24" />
      <Shimmer className="h-10 w-full rounded-md" />
    </div>
  )
}

export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <SkeletonField key={i} />
      ))}
      <Shimmer className="h-10 w-28 rounded-md" />
    </div>
  )
}

export function SkeletonStatTile() {
  return (
    <div className="rounded-xl border border-border p-6 space-y-3">
      <Shimmer className="h-3 w-20" />
      <Shimmer className="h-7 w-28" />
    </div>
  )
}
