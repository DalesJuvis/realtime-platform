/**
 * # MessageList
 *
 * Scrollable message history for the active channel, auto-scrolling to the
 * newest message. Groups consecutive messages from the same sender.
 */

import { useEffect, useRef } from 'react'
import { ScrollArea } from '@components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@components/ui/avatar'
import { cn } from '@lib/utils'
import type { ChatMessage } from '@entities/Chat.entity'

interface MessageListProps {
  messages: ChatMessage[]
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No messages yet — say hello.
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-3 p-4">
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const groupedWithPrevious = previous?.from === message.from && previous?.direction === message.direction
          const sender = message.from ?? 'anonymous'

          return (
            <div
              key={message.id}
              className={cn('flex items-end gap-2', message.direction === 'out' && 'flex-row-reverse')}
            >
              {!groupedWithPrevious ? (
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-[10px]">{initials(sender)}</AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-7 shrink-0" />
              )}
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                  message.direction === 'out'
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground',
                )}
              >
                {!groupedWithPrevious && message.direction === 'in' && (
                  <p className="mb-0.5 text-xs font-semibold opacity-70">{sender}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                <p
                  className={cn(
                    'mt-1 text-right text-[10px] opacity-60',
                    message.direction === 'out' ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {formatTime(message.receivedAt)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
