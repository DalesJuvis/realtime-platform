/**
 * # WorkbenchPanel
 *
 * Expandable panel above the dev toolbar (saas-admin's "Workbench" panel,
 * adapted) — an "Overview" tab with this workspace's real resource counts
 * and an "API keys" tab showing the current secret key. No Sandbox tab:
 * this platform has no sandbox mode, and a placeholder tab that does
 * nothing is worse than not having the tab at all (same reasoning
 * saas-admin's own version documents for the tabs it leaves out).
 *
 * Slides up from the dev toolbar on open, back down on close — mount/unmount
 * animation via the parent's `AnimatePresence` (see `DevToolbar`).
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { CopyButton } from '@components/shared/CopyButton'
import { fetchWorkspaceResourceCounts, type ResourceCount } from '@lib/resourceCounts'
import { maskKey } from '@lib/utils'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { usePortalAuthStore } from '@store/portalAuth.store'

export function WorkbenchPanel({ onClose }: { onClose: () => void }) {
  const email = usePortalAuthStore((s) => s.email)
  const [counts, setCounts] = useState<ResourceCount[] | null>(null)
  const [secretKey, setSecretKey] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    fetchWorkspaceResourceCounts().then(setCounts)
    getKeysAction()
      .then((keys) => setSecretKey(keys.secretKey))
      .catch(() => setSecretKey(null))
  }, [])

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="fixed inset-x-0 bottom-9 z-40 flex max-h-96 flex-col border-t border-border bg-background shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Workbench</h2>
          <span className="text-sm text-muted-foreground">{email}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close workbench">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="keys">API keys</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {(counts ?? []).map((c) => (
                <Link
                  key={c.label}
                  to={c.to}
                  onClick={onClose}
                  className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{c.value ?? '—'}</p>
                </Link>
              ))}
              {counts === null && <p className="col-span-full text-sm text-muted-foreground">Loading…</p>}
            </div>
          </TabsContent>

          <TabsContent value="keys">
            <div className="max-w-xl space-y-3">
              <p className="text-sm text-muted-foreground">The secret key currently active for this workspace.</p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
                <span className="flex-1 truncate">
                  {secretKey === undefined ? 'Loading…' : secretKey === null ? '—' : maskKey(secretKey)}
                </span>
                {secretKey && <CopyButton value={secretKey} label="Secret key" />}
              </div>
              <Link to="/settings" onClick={onClose} className="inline-block text-sm font-medium text-primary hover:underline">
                Manage keys in Settings →
              </Link>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  )
}
