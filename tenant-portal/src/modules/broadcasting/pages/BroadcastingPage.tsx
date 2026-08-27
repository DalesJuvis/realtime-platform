/**
 * # BroadcastingPage
 *
 * Compose and publish a message to a channel of this tenant. Sends
 * through the portal session (see `sendBroadcastAction`'s doc comment) —
 * no separate client-token step. One frame's worth of payload (211 UTF-8
 * bytes), no chunking: the counter below the textarea reflects that limit exactly.
 */

import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { sendBroadcastAction } from '@actions/broadcast/sendBroadcast.action'
import { getTemplatesAction } from '@actions/templates/getTemplates.action'
import { errorMessage } from '@lib/errors'
import type { Template } from '@entities/Template.entity'

const MAX_PAYLOAD_BYTES = 211

export default function BroadcastingPage() {
  const [channelId, setChannelId] = useState('')
  const [payload, setPayload] = useState('')
  const [isSending, setSending] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])

  useEffect(() => {
    getTemplatesAction()
      .then(setTemplates)
      .catch(() => {
        // Templates are a convenience here, not required to send — a
        // failed fetch shouldn't block the compose form.
      })
  }, [])

  const payloadBytes = new TextEncoder().encode(payload).length
  const overLimit = payloadBytes > MAX_PAYLOAD_BYTES

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (overLimit) return
    setSending(true)
    try {
      await sendBroadcastAction({ channelId: channelId.trim(), payload })
      toast.success(`Published to "${channelId.trim()}".`)
      setPayload('')
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to send broadcast.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Broadcasting</h1>
        <p className="text-sm text-muted-foreground">Publish a message to any channel right now.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Compose</CardTitle>
            <CardDescription>Sent immediately to every subscriber currently on this channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="channelId">Channel</Label>
                <Input
                  id="channelId"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  placeholder="orders:42"
                  className="font-mono text-sm"
                  maxLength={24}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payload">Message</Label>
                <Textarea
                  id="payload"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  placeholder="Type your message…"
                  rows={5}
                  required
                />
                <p className={`text-right text-xs tabular-nums ${overLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {payloadBytes} / {MAX_PAYLOAD_BYTES} bytes
                </p>
              </div>
              <Button type="submit" disabled={isSending || overLimit || !channelId.trim() || !payload}>
                <Send className="h-4 w-4" />
                {isSending ? 'Sending…' : 'Send broadcast'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Templates</CardTitle>
            <CardDescription>Click one to load it into the composer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved templates yet.</p>
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setPayload(template.body)}
                  className="block w-full rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <p className="font-medium">{template.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{template.body}</p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
