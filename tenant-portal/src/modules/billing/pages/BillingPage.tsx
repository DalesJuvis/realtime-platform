/**
 * # BillingPage
 *
 * Mock invoice history — this platform has no billing backend yet, so
 * every row here is illustrative sample data, not a real API response
 * (see the `source: { type: 'json', ... }` below, as opposed to
 * `{ type: 'request', fn: ... }` elsewhere in this app).
 */

import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@components/ui/badge'
import { DataTable } from '@components/DataTable/DataTable'
import { formatDate } from '@lib/utils'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { Invoice, InvoiceStatus } from '@entities/Invoice.entity'

const STATUS_VARIANT: Record<InvoiceStatus, 'success' | 'warning' | 'destructive'> = {
  paid: 'success',
  pending: 'warning',
  failed: 'destructive',
}

const MOCK_INVOICES: Invoice[] = [
  { id: '1', reference: 'INV-2026-0012', period: 'Aug 2026', amount: 12500, currency: 'XOF', status: 'paid', issued_at: '2026-08-01T09:00:00Z' },
  { id: '2', reference: 'INV-2026-0011', period: 'Jul 2026', amount: 12500, currency: 'XOF', status: 'paid', issued_at: '2026-07-01T09:00:00Z' },
  { id: '3', reference: 'INV-2026-0010', period: 'Jun 2026', amount: 12500, currency: 'XOF', status: 'paid', issued_at: '2026-06-01T09:00:00Z' },
  { id: '4', reference: 'INV-2026-0009', period: 'May 2026', amount: 9800, currency: 'XOF', status: 'failed', issued_at: '2026-05-01T09:00:00Z' },
  { id: '5', reference: 'INV-2026-0008', period: 'Apr 2026', amount: 9800, currency: 'XOF', status: 'paid', issued_at: '2026-04-01T09:00:00Z' },
  { id: '6', reference: 'INV-2026-0007', period: 'Mar 2026', amount: 9800, currency: 'XOF', status: 'paid', issued_at: '2026-03-01T09:00:00Z' },
  { id: '7', reference: 'INV-2026-0006', period: 'Feb 2026', amount: 9800, currency: 'XOF', status: 'pending', issued_at: '2026-02-01T09:00:00Z' },
  { id: '8', reference: 'INV-2026-0005', period: 'Jan 2026', amount: 9800, currency: 'XOF', status: 'paid', issued_at: '2026-01-01T09:00:00Z' },
  { id: '9', reference: 'INV-2025-0004', period: 'Dec 2025', amount: 9800, currency: 'XOF', status: 'paid', issued_at: '2025-12-01T09:00:00Z' },
  { id: '10', reference: 'INV-2025-0003', period: 'Nov 2025', amount: 9800, currency: 'XOF', status: 'paid', issued_at: '2025-11-01T09:00:00Z' },
  { id: '11', reference: 'INV-2025-0002', period: 'Oct 2025', amount: 4900, currency: 'XOF', status: 'paid', issued_at: '2025-10-01T09:00:00Z' },
  { id: '12', reference: 'INV-2025-0001', period: 'Sep 2025', amount: 4900, currency: 'XOF', status: 'paid', issued_at: '2025-09-01T09:00:00Z' },
]

const columns: ColumnDef<Invoice>[] = [
  { key: 'reference', header: 'Reference', sortable: true },
  { key: 'period', header: 'Period' },
  {
    key: 'amount',
    header: 'Amount',
    sortable: true,
    align: 'right',
    renderCell: (_v, row) => `${row.amount.toLocaleString('en-US')} ${row.currency}`,
  },
  {
    key: 'status',
    header: 'Status',
    renderCell: (_v, row) => (
      <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
        {row.status}
      </Badge>
    ),
  },
  { key: 'issued_at', header: 'Issued', sortable: true, renderCell: (_v, row) => formatDate(row.issued_at) },
]

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Invoices for this workspace's plan — sample data, not yet wired to a real billing backend.</p>
      </div>

      <DataTable
        source={{ type: 'json', data: MOCK_INVOICES }}
        columns={columns}
        selectable
        getRowId={(row) => row.id}
        exportFilename="invoices"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'paid', label: 'Paid' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
            ],
          },
        ]}
        rowActions={() => [
          {
            label: 'Download PDF',
            icon: Download,
            onClick: () => { toast.info('Invoice PDFs are not available yet.') },
          },
        ]}
      />
    </div>
  )
}
