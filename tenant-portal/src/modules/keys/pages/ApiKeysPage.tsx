/**
 * # ApiKeysPage
 *
 * Mock key-pair listing — one row per named pair (public + secret created
 * and revoked together), not separate rows per key. Your actual, working
 * key pair — the one the SDK uses — lives at Settings → API keys (single
 * tenant ID + secret, backed by the real `GET /api/v1/portal/keys`). This
 * page mocks a Stripe-style "many named key pairs" list; the backend
 * doesn't support multiple key pairs per tenant yet, so every row here is
 * sample data, not a real key.
 */

import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Ban, Copy } from 'lucide-react'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { DataTable } from '@components/DataTable/DataTable'
import { formatDateTime } from '@lib/utils'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { MockApiKeyMode, MockApiKeyPair, MockApiKeyStatus } from '@entities/MockApiKey.entity'

const MODE_VARIANT: Record<MockApiKeyMode, 'warning' | 'success'> = {
  sandbox: 'warning',
  production: 'success',
}

const STATUS_VARIANT: Record<MockApiKeyStatus, 'success' | 'neutral'> = {
  active: 'success',
  revoked: 'neutral',
}

const MOCK_KEY_PAIRS: MockApiKeyPair[] = [
  { id: '1', name: 'Hobby', mode: 'sandbox', public_key: 'pk_sandbox_9c31…ecc6', secret_key: 'sk_sandbox_4f2a…7ba0', status: 'active', created_at: '2026-08-02T19:08:00Z' },
  { id: '2', name: 'Production server', mode: 'production', public_key: 'pk_live_9b7e…22ab', secret_key: 'sk_live_4f2a…9c31', status: 'active', created_at: '2026-06-01T10:00:00Z' },
  { id: '3', name: 'Staging server', mode: 'sandbox', public_key: 'pk_sandbox_a02f…78bd', secret_key: 'sk_sandbox_1c4d…6e02', status: 'active', created_at: '2026-05-14T14:20:00Z' },
  { id: '4', name: 'Mobile app (iOS)', mode: 'production', public_key: 'pk_live_3e91…c04a', secret_key: 'sk_live_88df…5a11', status: 'active', created_at: '2026-04-02T08:00:00Z' },
  { id: '5', name: 'Old CI pipeline', mode: 'sandbox', public_key: 'pk_sandbox_77aa…f410', secret_key: 'sk_sandbox_c290…33de', status: 'revoked', created_at: '2026-01-10T09:00:00Z' },
  { id: '6', name: 'Legacy widget', mode: 'production', public_key: 'pk_live_3e91…c04a', secret_key: 'sk_live_a610…90fe', status: 'revoked', created_at: '2025-11-20T09:00:00Z' },
]

function KeyCell({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => {
          void navigator.clipboard.writeText(value)
          toast.success('Copied.')
        }}
        aria-label={`Copy ${value}`}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  )
}

const columns: ColumnDef<MockApiKeyPair>[] = [
  { key: 'name', header: 'Name', sortable: true },
  {
    key: 'mode',
    header: 'Mode',
    renderCell: (_v, row) => (
      <Badge variant={MODE_VARIANT[row.mode]} className="capitalize">
        {row.mode}
      </Badge>
    ),
  },
  { key: 'public_key', header: 'Public key (pk_)', renderCell: (_v, row) => <KeyCell value={row.public_key} /> },
  { key: 'secret_key', header: 'Secret key (sk_)', renderCell: (_v, row) => <KeyCell value={row.secret_key} /> },
  {
    key: 'status',
    header: 'Status',
    renderCell: (_v, row) => (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          pk_ <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          sk_ <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
        </div>
      </div>
    ),
  },
  { key: 'created_at', header: 'Created', sortable: true, renderCell: (_v, row) => formatDateTime(row.created_at) },
]

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Sample data — your real key pair is at{' '}
          <Link to="/settings" className="font-medium text-primary hover:underline">
            Settings → API keys
          </Link>
          .
        </p>
      </div>

      <DataTable
        source={{ type: 'json', data: MOCK_KEY_PAIRS }}
        columns={columns}
        selectable
        getRowId={(row) => row.id}
        exportFilename="api-keys"
        filters={[
          {
            key: 'mode',
            label: 'Mode',
            options: [
              { value: 'sandbox', label: 'Sandbox' },
              { value: 'production', label: 'Production' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'revoked', label: 'Revoked' },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: 'Revoke pair',
            icon: Ban,
            variant: 'destructive',
            hidden: row.status === 'revoked',
            onClick: () => { toast.info('Multi-key management is not available yet.') },
          },
        ]}
      />
    </div>
  )
}
