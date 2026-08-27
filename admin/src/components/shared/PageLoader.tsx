/**
 * # PageLoader — full-page shimmer fallback for lazy-loaded routes.
 */

import { SkeletonStatTile, SkeletonTable } from '@components/ui/Skeleton'

export function PageLoader() {
  return (
    <div className="space-y-6 p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
      </div>
      <table className="w-full">
        <tbody>
          <SkeletonTable rows={5} cols={4} />
        </tbody>
      </table>
    </div>
  )
}
