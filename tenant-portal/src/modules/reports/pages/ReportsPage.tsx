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
import { useTranslation } from '@lib/i18n'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { Report, ReportStatus } from '@entities/Report.entity'

const STATUS_VARIANT: Record<ReportStatus, 'success' | 'warning' | 'destructive'> = {
  ready: 'success',
  processing: 'warning',
  failed: 'destructive',
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

export default function ReportsPage() {
  const { t } = useTranslation()

  const columns: ColumnDef<Report>[] = [
    { key: 'name', header: t.reports.columns.name, sortable: true },
    { key: 'type', header: t.reports.columns.type, renderCell: (_v, row) => t.reports.typeOptions[row.type] },
    { key: 'period', header: t.reports.columns.period },
    {
      key: 'status',
      header: t.common.status,
      renderCell: (_v, row) => (
        <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
          {t.reports.statusOptions[row.status]}
        </Badge>
      ),
    },
    { key: 'generated_at', header: t.reports.columns.generated, sortable: true, renderCell: (_v, row) => formatDateTime(row.generated_at) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.reports.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.reports.pageSubtitle}</p>
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
            label: t.reports.typeFilterLabel,
            options: [
              { value: 'usage', label: t.reports.typeOptions.usage },
              { value: 'activity', label: t.reports.typeOptions.activity },
              { value: 'billing', label: t.reports.typeOptions.billing },
            ],
          },
          {
            key: 'status',
            label: t.common.status,
            options: [
              { value: 'ready', label: t.reports.statusOptions.ready },
              { value: 'processing', label: t.reports.statusOptions.processing },
              { value: 'failed', label: t.reports.statusOptions.failed },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: t.reports.download,
            icon: Download,
            disabled: row.status !== 'ready',
            onClick: () => { toast.info(t.reports.downloadNotAvailable) },
          },
        ]}
      />
    </div>
  )
}
