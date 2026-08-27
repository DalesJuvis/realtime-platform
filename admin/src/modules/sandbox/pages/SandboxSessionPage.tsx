/**
 * # SandboxSessionPage
 *
 * Live chat view joined to a session's channel(s) — opened in a new tab
 * from `SandboxPage`. Mints its own short-lived "agent" client token
 * (`mintTenantTokenAction`, no tenant secret needed) and connects via the
 * real SDK (`RealtimeClient`, not the adapter-neutral `RealtimeAdapter` —
 * this tool needs `replay()`/`on()`, which aren't part of that interface).
 *
 * Honest limitation: the wire frame carries no sender identity (see
 * `Frame`'s layout — tenant/channel/payload only), so a received message
 * can't be attributed to whoever actually published it. Messages this tab
 * itself sends are labeled "You" from local state; everything else is
 * labeled generically as the target session's `sub` — accurate only when
 * exactly two parties (this agent + the one session) are on the channel,
 * which is the sandbox's intended use, not a general chat inspector.
 */

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Send, Radio, WifiOff } from 'lucide-react'
import { RealtimeClient } from '@yourorg/realtime-sdk'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Badge } from '@components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { mintTenantTokenAction } from '@actions/tenants/mintTenantToken.action'
import { useAdminAuthStore } from '@store/adminAuth.store'
import { errorMessage } from '@lib/errors'
import { deriveWsHost } from '@lib/utils'

const WS_PORT = 8080

interface ChatMessage {
  readonly id: string
  readonly channelId: string
  readonly payload: string
  readonly receivedAt: number
  readonly mine: boolean
}

export default function SandboxSessionPage() {
  const [params] = useSearchParams()
  const tenantId = params.get('tenantId') ?? ''
  const targetSub = params.get('sub') ?? 'unknown'
  const channels = (params.get('channels') ?? '').split(',').filter(Boolean)
  const apiUrl = useAdminAuthStore((s) => s.apiUrl)

  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [channel, setChannel] = useState(channels[0] ?? '')
  const [draft, setDraft] = useState('')
  const clientRef = useRef<RealtimeClient | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tenantId || channels.length === 0 || !apiUrl) return
    let cancelled = false

    async function join() {
      try {
        const agentSub = `agent-${Math.random().toString(36).slice(2, 8)}`
        const token = await mintTenantTokenAction(tenantId, agentSub)
        if (cancelled) return

        const client = new RealtimeClient({ host: deriveWsHost(apiUrl!), port: WS_PORT, tenantId, token })
        clientRef.current = client

        client.on('open', () => setStatus('connected'))
        client.on('close', () => setStatus('disconnected'))
        client.on('error', (err) => toast.error(errorMessage(err, 'Connection error.')))

        for (const c of channels) {
          client.subscribe(c, (message) => {
            setMessages((prev) => [
              ...prev,
              { id: `${message.receivedAt}-${Math.random()}`, channelId: message.channelId, payload: message.payload, receivedAt: message.receivedAt, mine: false },
            ])
          })
        }

        client.connect()
        for (const c of channels) client.replay(c)
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Failed to join session.'))
      }
    }

    join()
    return () => {
      cancelled = true
      clientRef.current?.disconnect()
      clientRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, apiUrl])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !clientRef.current || !channel) return
    clientRef.current.publish(channel, text)
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, channelId: channel, payload: text, receivedAt: Date.now(), mine: true }])
    setDraft('')
  }

  if (!tenantId || channels.length === 0) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Missing session parameters — open this page from Sandbox's session list.
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <p className="font-semibold">{targetSub}</p>
          <p className="text-xs text-muted-foreground">Tenant {tenantId}</p>
        </div>
        <div className="flex items-center gap-3">
          {channels.length > 1 && (
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant={status === 'connected' ? 'success' : status === 'connecting' ? 'warning' : 'neutral'}>
            {status === 'connected' ? <Radio className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
            {status}
          </Badge>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — history (if any) and new activity on {channel || 'this channel'} will appear here.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-md rounded-2xl px-4 py-2 text-sm ${
                m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              }`}
            >
              <p>{m.payload}</p>
              <p className={`mt-1 text-[10px] ${m.mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {m.mine ? 'You' : targetSub} · {new Date(m.receivedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border px-6 py-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type here"
          disabled={status !== 'connected'}
          maxLength={211}
        />
        <Button type="submit" size="icon" disabled={status !== 'connected' || !draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
