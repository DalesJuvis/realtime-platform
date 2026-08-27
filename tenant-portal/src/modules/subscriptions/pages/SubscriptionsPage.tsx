/**
 * # SubscriptionsPage
 *
 * Mock plan history — no billing backend behind this yet (see
 * `BillingPage`'s doc comment for the same caveat).
 */

import { toast } from 'sonner'
import { Ban } from 'lucide-react'
import { Badge } from '@components/ui/badge'
import { DataTable } from '@components/DataTable/DataTable'
import { formatDate } from '@lib/utils'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { SubscriptionEvent, SubscriptionStatus } from '@entities/SubscriptionEvent.entity'

const STATUS_VARIANT: Record<SubscriptionStatus, 'success' | 'neutral' | 'destructive'> = {
  active: 'success',
  canceled: 'neutral',
  past_due: 'destructive',
}

const MOCK_SUBSCRIPTIONS: SubscriptionEvent[] = [
  { id: '1', plan: 'Pro', status: 'active', price: 29000, currency: 'XOF', started_at: '2026-06-01T00:00:00Z', renews_at: '2026-09-01T00:00:00Z' },
  { id: '2', plan: 'Starter', status: 'canceled', price: 9000, currency: 'XOF', started_at: '2026-01-15T00:00:00Z', renews_at: null },
  { id: '3', plan: 'Starter', status: 'canceled', price: 9000, currency: 'XOF', started_at: '2025-09-01T00:00:00Z', renews_at: null },
  { id: '4', plan: 'Free', status: 'canceled', price: 0, currency: 'XOF', started_at: '2025-06-10T00:00:00Z', renews_at: null },
]

const columns: ColumnDef<SubscriptionEvent>[] = [
  { key: 'plan', header: 'Plan', sortable: true },
  {
    key: 'status',
    header: 'Status',
    renderCell: (_v, row) => (
      <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
        {row.status.replace('_', ' ')}
      </Badge>
    ),
  },
  {
    key: 'price',
    header: 'Price',
    sortable: true,
    align: 'right',
    renderCell: (_v, row) => (row.price === 0 ? 'Free' : `${row.price.toLocaleString('en-US')} ${row.currency}/mo`),
  },
  { key: 'started_at', header: 'Started', sortable: true, renderCell: (_v, row) => formatDate(row.started_at) },
  { key: 'renews_at', header: 'Renews', renderCell: (_v, row) => (row.renews_at ? formatDate(row.renews_at) : '—') },
]

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">This workspace's plan history — sample data, not yet wired to a real billing backend.</p>
      </div>

      <DataTable
        source={{ type: 'json', data: MOCK_SUBSCRIPTIONS }}
        columns={columns}
        selectable
        getRowId={(row) => row.id}
        exportFilename="subscriptions"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'canceled', label: 'Canceled' },
              { value: 'past_due', label: 'Past due' },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: 'Cancel plan',
            icon: Ban,
            variant: 'destructive',
            hidden: row.status !== 'active',
            onClick: () => { toast.info('Plan cancellation is not available yet.') },
          },
        ]}
      />
    </div>
  )
}
