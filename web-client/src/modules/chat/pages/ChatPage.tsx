/**
 * # ChatPage
 *
 * Main chat surface: message list + composer for the active channel,
 * inside `AppLayout`'s responsive shell.
 */

import { Hash } from 'lucide-react'
import { useChannelList } from '@hooks/chat/useChannelList'
import { useChannel } from '@hooks/chat/useChannel'
import { MessageList } from '@modules/chat/components/MessageList'
import { MessageInput } from '@modules/chat/components/MessageInput'
import { AppLayout } from '@components/layouts/AppLayout'

export function ChatPage() {
  const { activeChannelId } = useChannelList()
  const { messages, send, remainingBytes } = useChannel(activeChannelId)

  return (
    <AppLayout>
      {activeChannelId ? (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <h1 className="font-semibold">{activeChannelId}</h1>
          </header>
          <MessageList messages={messages} />
          <MessageInput onSend={send} remainingBytes={remainingBytes} />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
          Join or select a channel to start chatting.
        </div>
      )}
    </AppLayout>
  )
}
