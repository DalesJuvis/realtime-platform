/**
 * # TrackTenantDialog
 *
 * Adds an already-existing tenant ID to the local registry without calling
 * the backend — for a tenant created elsewhere (another admin, the
 * `DEMO_TENANT_SECRET` docker-compose registers, a CLI script) that this
 * app doesn't know about yet. No secret is asked for or stored; rotate the
 * secret afterwards from the table if one is needed here.
 */

import { useState } from 'react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { useDialog } from '@providers/DialogProvider'
import { useTenantsStore } from '@store/tenants.store'
import type { TenantId } from '@entities/Tenant.entity'

export function TrackTenantDialog() {
  const dialog = useDialog()
  const addTenant = useTenantsStore((s) => s.add)
  const [tenantId, setTenantId] = useState('')
  const [label, setLabel] = useState('')

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const id = tenantId.trim()
    if (!id) return
    addTenant(id as TenantId, label.trim() || id, null)
    dialog.closeAll()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="track-id">Tenant ID</Label>
        <Input
          id="track-id"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000001"
          className="font-mono text-sm"
          autoFocus
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="track-label">Label</Label>
        <Input id="track-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => dialog.closeAll()}>
          Cancel
        </Button>
        <Button type="submit">Add to list</Button>
      </div>
    </form>
  )
}
