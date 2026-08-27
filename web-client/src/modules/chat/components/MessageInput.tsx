/**
 * # MessageInput
 *
 * Composer for the active channel. Enter sends, Shift+Enter inserts a
 * newline. Shows a live byte counter against the 211-byte payload budget
 * (accounting for the `{from,text}` JSON envelope overhead) and disables
 * sending once the budget would be exceeded.
 */

import { type KeyboardEvent, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { cn } from '@lib/utils'

interface MessageInputProps {
  onSend: (text: string) => void
  remainingBytes: (text: string) => number
  disabled?: boolean
}

export function MessageInput({ onSend, remainingBytes, disabled }: MessageInputProps) {
  const [text, setText] = useState('')
  const remaining = remainingBytes(text)
  const overLimit = remaining < 0
  const canSend = text.trim().length > 0 && !overLimit && !disabled

  function submit(): void {
    if (!canSend) return
    onSend(text)
    setText('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Connect to start chatting…' : 'Message…'}
          disabled={disabled}
          rows={1}
          className="max-h-32"
        />
        <Button type="button" size="icon" onClick={submit} disabled={!canSend}>
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
      <p className={cn('mt-1 text-right text-xs text-muted-foreground', overLimit && 'text-destructive')}>
        {remaining} bytes left
      </p>
    </div>
  )
}
