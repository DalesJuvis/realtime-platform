/**
 * # Sparkline
 *
 * Minimal inline-SVG bar sparkline — cloned from saas-admin's version, but
 * fed differently: that one buckets historical transaction timestamps by
 * day (a backend this platform doesn't have). This one takes the last N
 * samples observed from `OverviewPage`'s own 5s poll — a real, if short,
 * live trend rather than fabricated history.
 */

export function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null

  const max = Math.max(...values, 1)
  const barWidth = 8
  const gap = 4
  const width = values.length * (barWidth + gap)

  return (
    <svg viewBox={`0 0 ${width} 32`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden="true">
      {values.map((v, i) => {
        const height = Math.max((v / max) * 28, 2)
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={32 - height}
            width={barWidth}
            height={height}
            rx={1.5}
            className="fill-primary/70"
          />
        )
      })}
    </svg>
  )
}
