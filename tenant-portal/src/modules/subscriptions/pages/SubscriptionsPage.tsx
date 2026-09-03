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
import { useTranslation } from '@lib/i18n'
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

export default function SubscriptionsPage() {
  const { t } = useTranslation()

  const columns: ColumnDef<SubscriptionEvent>[] = [
    { key: 'plan', header: t.subscriptions.columns.plan, sortable: true },
    {
      key: 'status',
      header: t.common.status,
      renderCell: (_v, row) => (
        <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
          {t.subscriptions.statusOptions[row.status]}
        </Badge>
      ),
    },
    {
      key: 'price',
      header: t.subscriptions.columns.price,
      sortable: true,
      align: 'right',
      renderCell: (_v, row) => (row.price === 0 ? t.subscriptions.free : t.subscriptions.monthlyPrice(`${row.price.toLocaleString('en-US')} ${row.currency}`)),
    },
    { key: 'started_at', header: t.subscriptions.columns.started, sortable: true, renderCell: (_v, row) => formatDate(row.started_at) },
    { key: 'renews_at', header: t.subscriptions.columns.renews, renderCell: (_v, row) => (row.renews_at ? formatDate(row.renews_at) : '—') },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.subscriptions.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.subscriptions.pageSubtitle}</p>
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
            label: t.common.status,
            options: [
              { value: 'active', label: t.subscriptions.statusOptions.active },
              { value: 'canceled', label: t.subscriptions.statusOptions.canceled },
              { value: 'past_due', label: t.subscriptions.statusOptions.past_due },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: t.subscriptions.cancelPlan,
            icon: Ban,
            variant: 'destructive',
            hidden: row.status !== 'active',
            onClick: () => { toast.info(t.subscriptions.cancelNotAvailable) },
          },
        ]}
      />
    </div>
  )
}
