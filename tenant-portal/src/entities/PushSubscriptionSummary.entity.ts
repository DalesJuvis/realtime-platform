/**
 * # PushSubscriptionSummaryEntity
 *
 * Mirrors `PushSubscriptionSummaryResponseDto` from `modules::portal` —
 * one device subscribed to this tenant's Web Push, for the Settings
 * device list. Never carries the P-256/auth crypto keys — the portal has
 * no use for them, only for `endpoint` (needed to revoke) and the fields
 * that describe the row to a human.
 */
export interface PushSubscriptionSummary {
  readonly endpoint: string
  readonly sub: string
  readonly channels: string[]
  readonly device_label: string | null
  readonly created_at: string
}
