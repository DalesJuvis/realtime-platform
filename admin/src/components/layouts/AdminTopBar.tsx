/**
 * # AdminTopBar
 *
 * Search box over the local tenant registry (see `tenants.store.ts` — the
 * backend has nothing to search server-side) + a shortcut to Settings.
 */

import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Search } from 'lucide-react'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'
import { useClickOutside } from '@hooks/useClickOutside'
import { useTenantsStore } from '@store/tenants.store'

export function AdminTopBar() {
  const navigate = useNavigate()
  const tenants = useTenantsStore((s) => s.tenants)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  const q = query.trim().toLowerCase()
  const matches = q ? tenants.filter((t) => t.label.toLowerCase().includes(q) || t.tenantId.includes(q)) : []

  return (
    <div className="flex w-full items-center gap-3 border-b border-border bg-background px-4 py-2.5">
      <div ref={ref} className="relative max-w-xs flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search known tenants…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          className="border-none bg-muted/60 pl-8 shadow-none focus-visible:ring-1"
        />
        {open && q && (
          <div className="absolute left-0 right-auto top-full z-50 mt-2 max-h-80 w-80 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
            {matches.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No known tenant matches "{query}".</p>
            ) : (
              <ul className="py-1">
                {matches.slice(0, 8).map((t) => (
                  <li key={t.tenantId}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate('/admin/tenants')
                        setOpen(false)
                        setQuery('')
                      }}
                      className="flex w-full flex-col items-start px-4 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{t.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{t.tenantId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/settings')} aria-label="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>
    </div>
  )
}
