/**
 * # ReportsPage
 *
 * Mock generated-report list — no report-generation backend behind this
 * yet. `OverviewPage`'s stat tiles/lists are the real, live data in this
 * app; this page is where an exportable version of that would eventually live.
 */

import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { Badge } from '@components/ui/badge'
import { DataTable } from '@components/DataTable/DataTable'
import { formatDateTime } from '@lib/utils'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { Report, ReportStatus, ReportType } from '@entities/Report.entity'

const STATUS_VARIANT: Record<ReportStatus, 'success' | 'warning' | 'destructive'> = {
  ready: 'success',
  processing: 'warning',
  failed: 'destructive',
}

const TYPE_LABEL: Record<ReportType, string> = {
  usage: 'Usage',
  activity: 'Activity',
  billing: 'Billing',
}

const MOCK_REPORTS: Report[] = [
  { id: '1', name: 'August usage report', type: 'usage', period: 'Aug 2026', status: 'ready', generated_at: '2026-08-27T08:00:00Z' },
  { id: '2', name: 'Weekly activity digest', type: 'activity', period: 'Week 34', status: 'ready', generated_at: '2026-08-24T06:00:00Z' },
  { id: '3', name: 'July billing summary', type: 'billing', period: 'Jul 2026', status: 'ready', generated_at: '2026-08-01T08:00:00Z' },
  { id: '4', name: 'July usage report', type: 'usage', period: 'Jul 2026', status: 'ready', generated_at: '2026-08-01T08:00:00Z' },
  { id: '5', name: 'Weekly activity digest', type: 'activity', period: 'Week 33', status: 'ready', generated_at: '2026-08-17T06:00:00Z' },
  { id: '6', name: 'Channel growth report', type: 'activity', period: 'Q2 2026', status: 'failed', generated_at: '2026-07-15T06:00:00Z' },
  { id: '7', name: 'June usage report', type: 'usage', period: 'Jun 2026', status: 'ready', generated_at: '2026-07-01T08:00:00Z' },
  { id: '8', name: 'September usage report', type: 'usage', period: 'Sep 2026', status: 'processing', generated_at: '2026-08-27T09:12:00Z' },
]

const columns: ColumnDef<Report>[] = [
  { key: 'name', header: 'Report', sortable: true },
  { key: 'type', header: 'Type', renderCell: (_v, row) => TYPE_LABEL[row.type] },
  { key: 'period', header: 'Period' },
  {
    key: 'status',
    header: 'Status',
    renderCell: (_v, row) => (
      <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
        {row.status}
      </Badge>
    ),
  },
  { key: 'generated_at', header: 'Generated', sortable: true, renderCell: (_v, row) => formatDateTime(row.generated_at) },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Exportable activity and usage reports — sample data, not yet wired to a real report generator.</p>
      </div>

      <DataTable
        source={{ type: 'json', data: MOCK_REPORTS }}
        columns={columns}
        selectable
        getRowId={(row) => row.id}
        exportFilename="reports"
        filters={[
          {
            key: 'type',
            label: 'Type',
            options: [
              { value: 'usage', label: 'Usage' },
              { value: 'activity', label: 'Activity' },
              { value: 'billing', label: 'Billing' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'ready', label: 'Ready' },
              { value: 'processing', label: 'Processing' },
              { value: 'failed', label: 'Failed' },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: 'Download',
            icon: Download,
            disabled: row.status !== 'ready',
            onClick: () => { toast.info('Report downloads are not available yet.') },
          },
        ]}
      />
    </div>
  )
}
