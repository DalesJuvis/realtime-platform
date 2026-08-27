/**
 * # useChannelList
 *
 * Joined channels, unread counts per channel, and join/leave/select actions
 * for the sidebar / mobile drawer.
 */

import { useCallback } from 'react'
import { useChatStore } from '@store/chat.store'
import type { Channel, ChannelId } from '@entities/Chat.entity'

export function useChannelList() {
  const channelIds = useChatStore((s) => s.channelIds)
  const unreadByChannel = useChatStore((s) => s.unreadByChannel)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const joinChannel = useChatStore((s) => s.joinChannel)
  const leaveChannel = useChatStore((s) => s.leaveChannel)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)

  const channels: Channel[] = channelIds.map((id) => ({ id, unreadCount: unreadByChannel[id] ?? 0 }))

  const join = useCallback((channelId: ChannelId) => joinChannel(channelId.trim()), [joinChannel])
  const leave = useCallback((channelId: ChannelId) => leaveChannel(channelId), [leaveChannel])
  const select = useCallback((channelId: ChannelId) => setActiveChannel(channelId), [setActiveChannel])

  return { channels, activeChannelId, join, leave, select }
}
