/**
 * # useChannel
 *
 * Messages and send/history actions for one channel.
 */

import { useCallback } from 'react'
import { useChatStore } from '@store/chat.store'
import { useConnectionStore } from '@store/connection.store'
import type { ChannelId, ChatMessage } from '@entities/Chat.entity'
import { MAX_PAYLOAD_BYTES, utf8ByteLength } from '@lib/protocolLimits'

/**
 * Stable empty-array reference: the selector below must never allocate a
 * fresh `[]` literal on a "no messages yet" render — Zustand's default
 * `Object.is` equality would see a new array every call and re-render
 * forever (`useSyncExternalStore` "Maximum update depth exceeded").
 */
const EMPTY_MESSAGES: ChatMessage[] = []

export function useChannel(channelId: ChannelId | null) {
  const messages: ChatMessage[] = useChatStore((s) =>
    channelId ? (s.messagesByChannel[channelId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  )
  const sendMessage = useChatStore((s) => s.sendMessage)
  const replay = useConnectionStore((s) => s.replay)
  const displayName = useConnectionStore((s) => s.credentials?.displayName ?? '')

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!channelId || !trimmed) return
      sendMessage(channelId, trimmed)
    },
    [channelId, sendMessage],
  )

  const loadHistory = useCallback(() => {
    if (channelId) replay(channelId, 0)
  }, [channelId, replay])

  /** Bytes left in the 211-byte payload once the `{from,text}` envelope is accounted for. */
  const remainingBytes = useCallback(
    (text: string) => MAX_PAYLOAD_BYTES - utf8ByteLength(JSON.stringify({ from: displayName, text })),
    [displayName],
  )

  return { messages, send, loadHistory, remainingBytes }
}
