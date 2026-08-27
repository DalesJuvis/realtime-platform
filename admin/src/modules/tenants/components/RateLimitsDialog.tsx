/**
 * # RateLimitsDialog
 *
 * Sets a tenant's token-bucket rate-limit quotas
 * (`PUT /api/v1/admin/tenants/:id/limits`) — takes effect immediately.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { useDialog } from '@providers/DialogProvider'
import { useTenantsStore } from '@store/tenants.store'
import { setTenantLimitsAction } from '@actions/tenants/setTenantLimits.action'
import { errorMessage } from '@lib/errors'
import { DEFAULT_RATE_LIMITS, type RateLimitConfig, type TenantId } from '@entities/Tenant.entity'

const FIELDS: { key: keyof RateLimitConfig; label: string; help: string }[] = [
  { key: 'session_capacity', label: 'Session capacity', help: 'Token-bucket burst size per WebSocket/TCP session.' },
  { key: 'session_refill_per_sec', label: 'Session refill / sec', help: 'Tokens added back per second, per session.' },
  { key: 'tenant_capacity', label: 'Tenant capacity', help: 'Token-bucket burst size across the whole tenant.' },
  { key: 'tenant_refill_per_sec', label: 'Tenant refill / sec', help: 'Tokens added back per second, tenant-wide.' },
]

export function RateLimitsDialog({
  tenantId,
  initial,
}: {
  tenantId: TenantId
  initial: RateLimitConfig | null
}) {
  const dialog = useDialog()
  const updateLimits = useTenantsStore((s) => s.updateLimits)
  const [values, setValues] = useState<RateLimitConfig>(initial ?? DEFAULT_RATE_LIMITS)
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await setTenantLimitsAction(tenantId, values)
      updateLimits(tenantId, values)
      toast.success('Rate limits updated.')
      dialog.closeAll()
    } catch (err) {
      setError(errorMessage(err, 'Failed to update rate limits.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {FIELDS.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={field.key}>{field.label}</Label>
          <Input
            id={field.key}
            type="number"
            min={0}
            value={values[field.key]}
            onChange={(e) => setValues((v) => ({ ...v, [field.key]: Number(e.target.value) }))}
            required
          />
          <p className="text-xs text-muted-foreground">{field.help}</p>
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => dialog.closeAll()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save limits'}
        </Button>
      </div>
    </form>
  )
}
