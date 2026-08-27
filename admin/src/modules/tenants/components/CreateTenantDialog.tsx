/**
 * # CreateTenantDialog
 *
 * Registers a tenant (`POST /api/v1/admin/tenants`) and adds it to the
 * local registry (`tenants.store.ts`). `tenantId`/`secret` are optional —
 * left blank, the server generates both. On success, replaces itself with
 * `RevealSecretDialog` so the generated secret is shown exactly once.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { useDialog } from '@providers/DialogProvider'
import { useTenantsStore } from '@store/tenants.store'
import { createTenantAction } from '@actions/tenants/createTenant.action'
import { errorMessage } from '@lib/errors'
import type { TenantId } from '@entities/Tenant.entity'
import { RevealSecretDialog } from './RevealSecretDialog'

export function CreateTenantDialog() {
  const dialog = useDialog()
  const addTenant = useTenantsStore((s) => s.add)
  const [label, setLabel] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [secret, setSecret] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const trimmedId = tenantId.trim()
      const trimmedSecret = secret.trim()
      const response = await createTenantAction({
        ...(trimmedId && { tenant_id: trimmedId as TenantId }),
        ...(trimmedSecret && { secret: trimmedSecret }),
      })
      addTenant(response.tenant_id, label.trim() || response.tenant_id, null)
      toast.success('Tenant created.')
      dialog.closeAll()
      dialog.openDialog(<RevealSecretDialog tenantId={response.tenant_id} secret={response.secret} />, {
        title: 'Tenant secret',
        size: 'md',
      })
    } catch (err) {
      setError(errorMessage(err, 'Failed to create tenant.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="label">Label</Label>
        <Input
          id="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. acme-corp (for your own reference only)"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tenantId">Tenant ID (optional)</Label>
        <Input
          id="tenantId"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          placeholder="leave blank to auto-generate a UUID"
          className="font-mono text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="secret">Secret (optional)</Label>
        <Input
          id="secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="leave blank to auto-generate"
          className="font-mono text-sm"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => dialog.closeAll()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create tenant'}
        </Button>
      </div>
    </form>
  )
}
