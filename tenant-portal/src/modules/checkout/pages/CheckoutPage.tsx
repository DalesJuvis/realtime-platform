/**
 * # CheckoutPage
 *
 * Mock hosted-session list — this platform has no checkout/session-link
 * feature yet; every row here is sample data.
 */

import { toast } from 'sonner'
import { Copy, XCircle } from 'lucide-react'
import { Badge } from '@components/ui/badge'
import { DataTable } from '@components/DataTable/DataTable'
import { formatDateTime } from '@lib/utils'
import { useTranslation } from '@lib/i18n'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { CheckoutSession, CheckoutStatus } from '@entities/CheckoutSession.entity'

const STATUS_VARIANT: Record<CheckoutStatus, 'success' | 'neutral' | 'warning'> = {
  active: 'warning',
  completed: 'success',
  expired: 'neutral',
}

const MOCK_SESSIONS: CheckoutSession[] = [
  { id: '1', reference: 'CS-8F21A0', channel: 'Web', status: 'active', created_at: '2026-08-27T09:10:00Z', expires_at: '2026-08-27T10:10:00Z' },
  { id: '2', reference: 'CS-7B3C19', channel: 'Mobile', status: 'completed', created_at: '2026-08-26T16:44:00Z', expires_at: '2026-08-26T17:44:00Z' },
  { id: '3', reference: 'CS-4D9E22', channel: 'API', status: 'completed', created_at: '2026-08-26T12:02:00Z', expires_at: '2026-08-26T13:02:00Z' },
  { id: '4', reference: 'CS-1A7F88', channel: 'Web', status: 'expired', created_at: '2026-08-25T08:30:00Z', expires_at: '2026-08-25T09:30:00Z' },
  { id: '5', reference: 'CS-C2E014', channel: 'Mobile', status: 'completed', created_at: '2026-08-24T19:15:00Z', expires_at: '2026-08-24T20:15:00Z' },
  { id: '6', reference: 'CS-90B7D3', channel: 'Web', status: 'expired', created_at: '2026-08-23T11:00:00Z', expires_at: '2026-08-23T12:00:00Z' },
  { id: '7', reference: 'CS-5F4A6E', channel: 'API', status: 'completed', created_at: '2026-08-22T07:48:00Z', expires_at: '2026-08-22T08:48:00Z' },
]

export default function CheckoutPage() {
  const { t } = useTranslation()

  const columns: ColumnDef<CheckoutSession>[] = [
    { key: 'reference', header: t.checkout.columns.reference, sortable: true },
    { key: 'channel', header: t.checkout.columns.channel },
    {
      key: 'status',
      header: t.common.status,
      renderCell: (_v, row) => (
        <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
          {t.checkout.statusOptions[row.status]}
        </Badge>
      ),
    },
    { key: 'created_at', header: t.checkout.columns.created, sortable: true, renderCell: (_v, row) => formatDateTime(row.created_at) },
    { key: 'expires_at', header: t.checkout.columns.expires, renderCell: (_v, row) => formatDateTime(row.expires_at) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.checkout.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.checkout.pageSubtitle}</p>
      </div>

      <DataTable
        source={{ type: 'json', data: MOCK_SESSIONS }}
        columns={columns}
        selectable
        getRowId={(row) => row.id}
        exportFilename="checkout-sessions"
        filters={[
          {
            key: 'channel',
            label: t.checkout.channelFilterLabel,
            options: [
              { value: 'Web', label: t.checkout.channelOptions.Web },
              { value: 'Mobile', label: t.checkout.channelOptions.Mobile },
              { value: 'API', label: t.checkout.channelOptions.API },
            ],
          },
          {
            key: 'status',
            label: t.common.status,
            options: [
              { value: 'active', label: t.checkout.statusOptions.active },
              { value: 'completed', label: t.checkout.statusOptions.completed },
              { value: 'expired', label: t.checkout.statusOptions.expired },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: t.checkout.copyLink,
            icon: Copy,
            hidden: row.status !== 'active',
            onClick: () => { toast.info(t.checkout.copyNotAvailable) },
          },
          {
            label: t.checkout.expireNow,
            icon: XCircle,
            variant: 'destructive',
            hidden: row.status !== 'active',
            onClick: () => { toast.info(t.checkout.expireNotAvailable) },
          },
        ]}
      />
    </div>
  )
}
