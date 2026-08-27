/**
 * # useNotifications
 *
 * In-app notification list + unread count for the notification bell.
 */

import { useCallback } from 'react'
import { useNotificationsStore } from '@store/notifications.store'

export function useNotifications() {
  const items = useNotificationsStore((s) => s.items)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const markAllReadStore = useNotificationsStore((s) => s.markAllRead)

  const markAllRead = useCallback(() => markAllReadStore(), [markAllReadStore])

  return { items, unreadCount, markAllRead }
}
