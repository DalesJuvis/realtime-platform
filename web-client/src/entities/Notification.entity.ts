/**
 * # NotificationEntity
 *
 * In-app notification raised whenever a message arrives on a channel the
 * user isn't currently viewing. Purely client-side derived state — the
 * backend has no separate notification concept beyond channel messages.
 */

export interface AppNotification {
  readonly id: string
  readonly channelId: string
  readonly preview: string
  readonly createdAt: number
  readonly read: boolean
}
