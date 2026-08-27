export type ReportType = 'usage' | 'activity' | 'billing'
export type ReportStatus = 'ready' | 'processing' | 'failed'

export interface Report {
  readonly id: string
  readonly name: string
  readonly type: ReportType
  readonly period: string
  readonly status: ReportStatus
  readonly generated_at: string
}
