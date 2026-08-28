/**
 * # ChatStore
 *
 * Joined channels, their messages, and the active channel. Channel list is
 * persisted (localStorage) so reconnecting restores the same rooms; message
 * history is not (the backend's `replay()` is the source of truth for that —
 * see `useChannel`'s `loadHistory`).
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { RealtimeMessage, Unsubscribe } from '@mio/realtime-sdk'
import type { ChatMessage, ChannelId } from '@entities/Chat.entity'
import { useConnectionStore } from '@store/connection.store'
import { useNotificationsStore } from '@store/notifications.store'
import { decodeChatEnvelope, encodeChatEnvelope } from '@actions/chat/chatEnvelope.action'
import { omitKey } from '@lib/objectUtils'

const MAX_MESSAGES_PER_CHANNEL = 500

/** Live subscriptions, keyed by channel — not persisted, not part of render state. */
const liveSubscriptions = new Map<ChannelId, Unsubscribe>()

interface ChatState {
  readonly channelIds: ChannelId[]
  readonly activeChannelId: ChannelId | null
  readonly unreadByChannel: Record<ChannelId, number>
  readonly messagesByChannel: Record<ChannelId, ChatMessage[]>

  joinChannel: (channelId: ChannelId) => void
  leaveChannel: (channelId: ChannelId) => void
  setActiveChannel: (channelId: ChannelId | null) => void
  sendMessage: (channelId: ChannelId, text: string) => void
  rehydrateSubscriptions: () => void
}

function toChatMessage(raw: RealtimeMessage): ChatMessage {
  const envelope = decodeChatEnvelope(raw.payload)
  return {
    id: crypto.randomUUID(),
    channelId: raw.channelId,
    from: envelope?.from ?? null,
    text: envelope?.text ?? raw.payload,
    direction: 'in',
    receivedAt: raw.receivedAt,
  }
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => {
      function handleIncoming(raw: RealtimeMessage): void {
        const message = toChatMessage(raw)

        // The engine echoes a publish back to every subscriber, including
        // the publisher itself — skip it here since `sendMessage` already
        // appended an optimistic "out" bubble for it. Matched by envelope
        // `from`, the only sender identity this app has; two connections
        // sharing a display name would each suppress the other's messages
        // too, an acceptable tradeoff for this dev/demo client.
        const ownDisplayName = useConnectionStore.getState().credentials?.displayName
        if (message.from && ownDisplayName && message.from === ownDisplayName) return

        set((s) => {
          const existing = s.messagesByChannel[raw.channelId] ?? []
          const next = [...existing, message].slice(-MAX_MESSAGES_PER_CHANNEL)
          const isActive = s.activeChannelId === raw.channelId
          return {
            messagesByChannel: { ...s.messagesByChannel, [raw.channelId]: next },
            unreadByChannel: isActive
              ? s.unreadByChannel
              : { ...s.unreadByChannel, [raw.channelId]: (s.unreadByChannel[raw.channelId] ?? 0) + 1 },
          }
        })

        if (get().activeChannelId !== raw.channelId) {
          useNotificationsStore.getState().push(raw.channelId, message.text)
        }
      }

      function subscribeToChannel(channelId: ChannelId): void {
        if (liveSubscriptions.has(channelId)) return
        const unsubscribe = useConnectionStore.getState().subscribeChannel(channelId, handleIncoming)
        liveSubscriptions.set(channelId, unsubscribe)
      }

      return {
        channelIds: [],
        activeChannelId: null,
        unreadByChannel: {},
        messagesByChannel: {},

        joinChannel: (channelId) => {
          if (get().channelIds.includes(channelId)) {
            set({ activeChannelId: channelId })
            return
          }

          set((s) => ({
            channelIds: [...s.channelIds, channelId],
            activeChannelId: channelId,
            messagesByChannel: { ...s.messagesByChannel, [channelId]: [] },
          }))

          subscribeToChannel(channelId)
        },

        leaveChannel: (channelId) => {
          liveSubscriptions.get(channelId)?.()
          liveSubscriptions.delete(channelId)

          set((s) => ({
            channelIds: s.channelIds.filter((id) => id !== channelId),
            activeChannelId: s.activeChannelId === channelId ? null : s.activeChannelId,
            messagesByChannel: omitKey(s.messagesByChannel, channelId),
            unreadByChannel: omitKey(s.unreadByChannel, channelId),
          }))
        },

        setActiveChannel: (channelId) => {
          set((s) => ({
            activeChannelId: channelId,
            unreadByChannel: channelId ? { ...s.unreadByChannel, [channelId]: 0 } : s.unreadByChannel,
          }))
        },

        sendMessage: (channelId, text) => {
          const displayName = useConnectionStore.getState().credentials?.displayName ?? 'me'
          const payload = encodeChatEnvelope({ from: displayName, text })

          const message: ChatMessage = {
            id: crypto.randomUUID(),
            channelId,
            from: displayName,
            text,
            direction: 'out',
            receivedAt: Date.now(),
          }

          set((s) => ({
            messagesByChannel: {
              ...s.messagesByChannel,
              [channelId]: [...(s.messagesByChannel[channelId] ?? []), message].slice(-MAX_MESSAGES_PER_CHANNEL),
            },
          }))

          useConnectionStore.getState().publish(channelId, payload)
        },

        rehydrateSubscriptions: () => {
          liveSubscriptions.clear()
          for (const channelId of get().channelIds) {
            subscribeToChannel(channelId)
          }
        },
      }
    },
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ channelIds: state.channelIds }),
    },
  ),
)
