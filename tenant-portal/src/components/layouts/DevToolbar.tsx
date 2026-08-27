/**
 * # DevToolbar
 *
 * Fixed bottom bar, always visible regardless of page or scroll position —
 * cloned from saas-admin's `DevToolbar` chrome. Holds real, working
 * actions: toggle light/dark theme, ping the Portal API to confirm
 * connectivity (this platform has no dedicated `/health` route on the
 * Portal port, unlike the Admin API — so this reuses the already-
 * authenticated overview call as an honest connectivity check rather than
 * faking a health endpoint that doesn't exist), and expand `WorkbenchPanel`.
 */

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Sun, Moon, Terminal, ActivitySquare, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'
import { usePreferencesStore } from '@store/preferences.store'
import { getOverviewAction } from '@actions/overview/getOverview.action'
import { errorMessage } from '@lib/errors'
import { env } from '@lib/env'
import { WorkbenchPanel } from './WorkbenchPanel'

export function DevToolbar() {
  const theme = usePreferencesStore((s) => s.theme)
  const setTheme = usePreferencesStore((s) => s.setTheme)
  const [workbenchOpen, setWorkbenchOpen] = useState(false)
  const [checking, setChecking] = useState(false)

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  async function checkConnection() {
    setChecking(true)
    try {
      await getOverviewAction()
      toast.success(`Connected to ${env.defaultApiUrl}.`)
    } catch (err) {
      toast.error(errorMessage(err, `Could not reach ${env.defaultApiUrl}.`))
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {workbenchOpen && <WorkbenchPanel key="workbench" onClose={() => setWorkbenchOpen(false)} />}
      </AnimatePresence>

      <div className="flex w-full items-center justify-between border-t border-border bg-muted/40 px-4 py-1.5 text-muted-foreground">
        <button
          type="button"
          onClick={() => setWorkbenchOpen((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium"
        >
          <Terminal className="h-3.5 w-3.5" />
          Developer
          {workbenchOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Toggle theme</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={checkConnection}
                disabled={checking}
                aria-label="Check API connection"
              >
                <ActivitySquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Check connection ({env.defaultApiUrl})</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </>
  )
}
