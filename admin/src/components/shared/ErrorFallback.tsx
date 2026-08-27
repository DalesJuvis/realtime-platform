/**
 * # ErrorFallback
 *
 * Shared presentational fallback for both `AppErrorBoundary` (render-time
 * errors anywhere in the tree) and `RouteErrorPage` (router `errorElement`,
 * e.g. a lazy-chunk load failure). Layout is inspired by Stripe's status-page
 * pattern (thin accent stripe, abstract "broken UI" illustration behind a
 * shield glyph, reassurance copy, two recovery links) — reproduced as our
 * own component/copy, not a pixel trace of Stripe's actual page.
 */

import { useState } from 'react'
import { RotateCw, ShieldAlert, RadioTower, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useAdminAuthStore } from '@store/adminAuth.store'

interface ErrorFallbackProps {
  message?: string | undefined
  onReset?: () => void
}

const SKELETON_WIDTHS = ['w-full', 'w-5/6', 'w-full', 'w-2/3', 'w-4/5']

export function ErrorFallback({ message, onReset }: ErrorFallbackProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const apiUrl = useAdminAuthStore((s) => s.apiUrl)

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="relative mb-8 h-36 w-80 max-w-full rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-2.5">
            {SKELETON_WIDTHS.map((w, i) => (
              <div key={i} className={`h-3 ${w} rounded-full bg-muted`} />
            ))}
          </div>
          <span className="absolute -bottom-4 -right-4 flex h-12 w-12 items-center justify-center rounded-full border-4 border-background bg-amber-100 dark:bg-amber-500/20">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </span>
        </div>

        <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground">
          We're currently investigating an issue.
        </h1>
        <p className="mt-3 max-w-sm text-center text-sm text-muted-foreground">
          Our engineering team has been notified and is looking into an error on this page. Your data is safe —
          nothing was lost.
        </p>

        <div className="mt-5 flex items-center gap-4 text-sm">
          {apiUrl && (
            <a
              href={`${apiUrl}/api/v1/system/health`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              <RadioTower className="h-3.5 w-3.5" />
              Check instance status
            </a>
          )}
        </div>

        <Button
          className="mt-7 gap-2"
          onClick={onReset ?? (() => window.location.reload())}
        >
          <RotateCw className="h-4 w-4" />
          Reload page
        </Button>

        {message && (
          <div className="mt-6 w-full max-w-md">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {detailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {detailsOpen ? 'Hide' : 'Show'} technical details
            </button>
            {detailsOpen && (
              <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">
                {message}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
