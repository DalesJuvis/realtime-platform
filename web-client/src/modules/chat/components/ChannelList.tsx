/**
 * # ChannelList
 *
 * Joined channels with unread badges, a field to join a new channel by
 * name, and the connection status. Used both in the desktop sidebar and
 * inside the mobile drawer (`AppLayout`).
 */

import { type FormEvent, useState } from 'react'
import { Hash, LogOut, Plus, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Badge } from '@components/ui/badge'
import { ScrollArea } from '@components/ui/scroll-area'
import { Separator } from '@components/ui/separator'
import { cn } from '@lib/utils'
import { useChannelList } from '@hooks/chat/useChannelList'
import { useConnection } from '@hooks/connection/useConnection'
import { MAX_CHANNEL_ID_BYTES, utf8ByteLength } from '@lib/protocolLimits'
import { ConnectionStatusBadge } from '@components/shared/ConnectionStatusBadge'

interface ChannelListProps {
  onChannelSelected?: () => void
}

export function ChannelList({ onChannelSelected }: ChannelListProps) {
  const { channels, activeChannelId, join, leave, select } = useChannelList()
  const { disconnect, credentials } = useConnection()
  const [draft, setDraft] = useState('')

  function handleJoin(event: FormEvent): void {
    event.preventDefault()
    const name = draft.trim()
    if (!name || utf8ByteLength(name) > MAX_CHANNEL_ID_BYTES) return
    join(name)
    setDraft('')
    onChannelSelected?.()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{credentials?.displayName}</p>
          <ConnectionStatusBadge />
        </div>
        <Button variant="ghost" size="icon" onClick={disconnect} title="Disconnect">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <form onSubmit={handleJoin} className="flex gap-2 p-4">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="channel name"
          className="h-8"
          maxLength={MAX_CHANNEL_ID_BYTES}
        />
        <Button type="submit" size="icon" className="h-8 w-8 shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      <ScrollArea className="flex-1 px-2">
        <nav className="flex flex-col gap-0.5 pb-4">
          {channels.map((channel) => (
            <div key={channel.id} className="group relative">
              <button
                type="button"
                onClick={() => {
                  select(channel.id)
                  onChannelSelected?.()
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  channel.id === activeChannelId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
                )}
              >
                <Hash className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{channel.id}</span>
                {channel.unreadCount > 0 && (
                  <Badge variant="default" className="h-5 min-w-5 justify-center px-1">
                    {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                  </Badge>
                )}
              </button>
              <button
                type="button"
                onClick={() => leave(channel.id)}
                title="Leave channel"
                className="absolute right-1.5 top-1.5 hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {channels.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No channels yet — join one above.</p>
          )}
        </nav>
      </ScrollArea>
    </div>
  )
}
