export type SubscriptionStatus = 'active' | 'canceled' | 'past_due'

export interface SubscriptionEvent {
  readonly id: string
  readonly plan: string
  readonly status: SubscriptionStatus
  readonly price: number
  readonly currency: string
  readonly started_at: string
  readonly renews_at: string | null
}
