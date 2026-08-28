/**
 * # NotificationsStore
 *
 * In-app notification list, raised by `chat.store` whenever a message
 * arrives on a channel the user isn't currently viewing. Not persisted —
 * resets on page load, same as `ui.store`-style ephemeral state.
 */

import { create } from 'zustand'
import { randomId } from '@lib/utils'
import type { AppNotification } from '@entities/Notification.entity'

const MAX_NOTIFICATIONS = 100

interface NotificationsState {
  readonly items: AppNotification[]
  readonly unreadCount: number

  push: (channelId: string, preview: string) => void
  markAllRead: () => void
  clear: () => void
}

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  items: [],
  unreadCount: 0,

  push: (channelId, preview) => {
    const notification: AppNotification = {
      id: randomId(),
      channelId,
      preview,
      createdAt: Date.now(),
      read: false,
    }
    set((s) => ({
      items: [notification, ...s.items].slice(0, MAX_NOTIFICATIONS),
      unreadCount: s.unreadCount + 1,
    }))
  },

  markAllRead: () => {
    set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })), unreadCount: 0 }))
  },

  clear: () => set({ items: [], unreadCount: 0 }),
}))
