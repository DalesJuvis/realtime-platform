/**
 * # NotificationEntity
 *
 * Mirrors `NotificationResponseDto`/`NotificationListResponseDto` from
 * `modules::portal` — one received message, plus the feed's unread badge
 * count.
 */
export type NotificationDelivery = 'realtime' | 'push'

export interface Notification {
  readonly id: string
  readonly channel_id: string
  readonly payload: string
  /** Which path this message actually went out on — see
   * `NotificationDelivery` on the backend. */
  readonly delivery: NotificationDelivery
  readonly created_at: string
  readonly read_at: string | null
}

export interface NotificationList {
  readonly items: Notification[]
  readonly unread_count: number
}
