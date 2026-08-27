export type CheckoutChannel = 'Web' | 'Mobile' | 'API'
export type CheckoutStatus = 'active' | 'completed' | 'expired'

export interface CheckoutSession {
  readonly id: string
  readonly reference: string
  readonly channel: CheckoutChannel
  readonly status: CheckoutStatus
  readonly created_at: string
  readonly expires_at: string
}
