/**
 * # ActivityChart
 *
 * Multi-series line chart (react-chartjs-2 / Chart.js) of this workspace's
 * live metrics — a genuine trend built from `OverviewPage`'s own 5s poll
 * history (see `OverviewPage`'s doc comment: no backend time-series
 * endpoint exists, so this is real recent samples, not fabricated daily
 * aggregates). Colors are fixed literals rather than the app's CSS
 * variable tokens — Chart.js's canvas renderer takes plain color strings,
 * not `hsl(var(--x))`, so this is the one place in the app that can't
 * follow the theme automatically; chosen to read on both light and dark.
 */

import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

export interface ActivitySample {
  readonly label: string
  readonly sessions: number
  readonly messages: number
  readonly rateLimited: number
}

const GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const TICK_COLOR = 'rgba(148, 163, 184, 0.9)'

export function ActivityChart({ samples }: { samples: ActivitySample[] }) {
  const data = useMemo(
    () => ({
      labels: samples.map((s) => s.label),
      datasets: [
        {
          label: 'Active sessions',
          data: samples.map((s) => s.sessions),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.12)',
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Messages processed',
          data: samples.map((s) => s.messages),
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Rate limited',
          data: samples.map((s) => s.rateLimited),
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244, 63, 94, 0.08)',
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    }),
    [samples],
  )

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: { color: TICK_COLOR, usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { size: 11 } },
        },
        tooltip: { mode: 'index' as const, intersect: false },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: TICK_COLOR, maxRotation: 0, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, precision: 0, font: { size: 10 } } },
      },
    }),
    [],
  )

  if (samples.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        Collecting live samples — the chart fills in as data comes in.
      </div>
    )
  }

  return (
    <div className="h-56">
      <Line data={data} options={options} />
    </div>
  )
}
