export type InvoiceStatus = 'paid' | 'pending' | 'failed'

export interface Invoice {
  readonly id: string
  readonly reference: string
  readonly period: string
  readonly amount: number
  readonly currency: string
  readonly status: InvoiceStatus
  readonly issued_at: string
}
