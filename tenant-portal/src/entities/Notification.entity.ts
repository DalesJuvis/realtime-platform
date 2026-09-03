/**
 * # NotificationEntity
 *
 * Mirrors `NotificationResponseDto`/`NotificationListResponseDto` from
 * `modules::portal` — one received message, plus the feed's unread badge
 * count.
 */
export interface Notification {
  readonly id: string
  readonly channel_id: string
  readonly payload: string
  readonly created_at: string
  readonly read_at: string | null
}

export interface NotificationList {
  readonly items: Notification[]
  readonly unread_count: number
}
