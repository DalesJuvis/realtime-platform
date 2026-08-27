/**
 * # TenantsPage
 *
 * Tenant management against the real Admin API — create, rotate secret, set
 * rate limits, revoke. The list itself is entirely local (`tenants.store.ts`):
 * the backend has no listing endpoint, so this table is only ever as
 * complete as what this app has been told about (created here, or added via
 * "Track existing tenant").
 */

import { Plus, ListPlus, KeyRound, Gauge, Trash2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@components/DataTable/DataTable'
import type { ColumnDef, RowActionItem } from '@entities/DataTable.entity'
import { Button } from '@components/ui/button'
import { ConfirmDialog } from '@components/shared/ConfirmDialog'
import { useDialog } from '@providers/DialogProvider'
import { useTenantsStore } from '@store/tenants.store'
import { revokeTenantAction } from '@actions/tenants/revokeTenant.action'
import { rotateTenantSecretAction } from '@actions/tenants/rotateTenantSecret.action'
import { errorMessage } from '@lib/errors'
import { formatDateTime } from '@lib/utils'
import type { KnownTenant } from '@entities/Tenant.entity'
import { CreateTenantDialog } from '../components/CreateTenantDialog'
import { TrackTenantDialog } from '../components/TrackTenantDialog'
import { RateLimitsDialog } from '../components/RateLimitsDialog'
import { RevealSecretDialog } from '../components/RevealSecretDialog'

export default function TenantsPage() {
  const dialog = useDialog()
  const tenants = useTenantsStore((s) => s.tenants)
  const removeTenant = useTenantsStore((s) => s.remove)

  async function handleRotate(tenant: KnownTenant) {
    try {
      const response = await rotateTenantSecretAction(tenant.tenantId)
      toast.success('Secret rotated.')
      dialog.openDialog(<RevealSecretDialog tenantId={response.tenant_id} secret={response.secret} />, {
        title: 'New tenant secret',
      })
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to rotate secret.'))
    }
  }

  function handleLimits(tenant: KnownTenant) {
    dialog.openDialog(<RateLimitsDialog tenantId={tenant.tenantId} initial={tenant.limits} />, {
      title: 'Rate limits',
      description: tenant.label,
    })
  }

  function handleRevoke(tenant: KnownTenant) {
    dialog.openDialog(
      <ConfirmDialog
        message={`This immediately invalidates every client token for "${tenant.label}" — irreversible.`}
        confirmLabel="Revoke tenant"
        confirmationText={tenant.tenantId}
        onConfirm={async () => {
          await revokeTenantAction(tenant.tenantId)
          removeTenant(tenant.tenantId)
          toast.success('Tenant revoked.')
        }}
      />,
      { title: 'Revoke tenant?' },
    )
  }

  const columns: ColumnDef<KnownTenant>[] = [
    { key: 'label', header: 'Label', sortable: true },
    {
      key: 'tenantId',
      header: 'Tenant ID',
      renderCell: (value) => <span className="font-mono text-xs">{value as string}</span>,
    },
    {
      key: 'limits',
      header: 'Rate limits',
      renderCell: (value) => {
        const limits = value as KnownTenant['limits']
        return limits ? (
          <span className="text-xs text-muted-foreground">
            {limits.tenant_capacity}/{limits.tenant_refill_per_sec}s tenant · {limits.session_capacity}/
            {limits.session_refill_per_sec}s session
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">default</span>
        )
      },
    },
    {
      key: 'addedAt',
      header: 'Added',
      sortable: true,
      renderCell: (value) => <span className="text-xs text-muted-foreground">{formatDateTime(value as string)}</span>,
    },
  ]

  const rowActions = (tenant: KnownTenant): RowActionItem<KnownTenant>[] => [
    {
      label: 'Copy tenant ID',
      icon: Copy,
      onClick: () => navigator.clipboard.writeText(tenant.tenantId),
    },
    { label: 'Rotate secret', icon: KeyRound, onClick: () => handleRotate(tenant) },
    { label: 'Edit rate limits', icon: Gauge, onClick: () => handleLimits(tenant) },
    { label: 'Revoke', icon: Trash2, variant: 'destructive', onClick: () => handleRevoke(tenant) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            Locally tracked — this backend has no tenant listing endpoint.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => dialog.openDialog(<TrackTenantDialog />, { title: 'Track existing tenant' })}
          >
            <ListPlus className="h-4 w-4" />
            Track existing
          </Button>
          <Button onClick={() => dialog.openDialog(<CreateTenantDialog />, { title: 'Create tenant' })}>
            <Plus className="h-4 w-4" />
            Create tenant
          </Button>
        </div>
      </div>

      <DataTable
        source={{ type: 'json', data: tenants }}
        columns={columns}
        getRowId={(t) => t.tenantId}
        rowActions={rowActions}
        searchable
        renderEmpty={() => (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No tenants yet — create one or track an existing tenant ID.
          </div>
        )}
      />
    </div>
  )
}
