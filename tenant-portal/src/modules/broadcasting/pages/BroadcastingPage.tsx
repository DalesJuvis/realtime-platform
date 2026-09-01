/**
 * # BroadcastingPage
 *
 * Compose and publish a message to a channel of this tenant. Sends
 * through the portal session (see `sendBroadcastAction`'s doc comment) —
 * no separate client-token step. The wire frame is a fixed 256 bytes
 * total (see `entities::Frame`'s layout comment), but 45 of those are
 * protocol overhead (magic/opcode/tenant/channel/CRC) — the payload field
 * itself is 211 UTF-8 bytes, and that's the number enforced here and by
 * `BroadcastMessageUseCase::MAX_PAYLOAD_BYTES` server-side (a request over
 * it comes back `PortalError::PayloadTooLarge`). No chunking: a message
 * that doesn't fit must be split into multiple sends.
 */

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmojiPicker } from 'frimousse'
import { Send, Radio, Hash, ChevronDown, Smile, Paperclip, X, Search, Braces } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Badge } from '@components/ui/badge'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { useDialog } from '@providers/DialogProvider'
import { sendBroadcastAction } from '@actions/broadcast/sendBroadcast.action'
import { getTemplatesAction } from '@actions/templates/getTemplates.action'
import { getChannelsAction } from '@actions/channels/getChannels.action'
import { getDevicesAction } from '@actions/devices/getDevices.action'
import { errorMessage } from '@lib/errors'
import { cn, formatDateTime, randomId } from '@lib/utils'
import type { Template } from '@entities/Template.entity'
import type { Device } from '@entities/Device.entity'
import type { Channel } from '@entities/Channel.entity'

const MAX_PAYLOAD_BYTES = 211

/** Matches `{{name}}`, tolerating inner whitespace (`{{ name }}`) — the
 * same `{{variable}}` convention documented on `Template.body` itself
 * (display-only on this side, opaque text on the backend). */
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Unique variable names, in order of first appearance. */
function extractTemplateVariables(body: string): string[] {
  const seen = new Set<string>()
  for (const match of body.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    seen.add(match[1]!)
  }
  return [...seen]
}

function fillTemplateVariables(body: string, values: Record<string, string>): string {
  return body.replace(TEMPLATE_VARIABLE_PATTERN, (_match, name: string) => values[name] ?? '')
}

/** Rendered inside the global dialog (see `useDialog`) when a clicked
 * template has one or more `{{variable}}` placeholders — a template with
 * none skips this entirely and loads straight into the composer. */
function TemplateVariablesForm({
  body,
  variables,
  onFilled,
}: {
  body: string
  variables: string[]
  onFilled: (payload: string) => void
}) {
  const dialog = useDialog()
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(variables.map((name) => [name, ''])))

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onFilled(fillTemplateVariables(body, values))
    dialog.closeAll()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {variables.map((name, i) => (
        <div key={name} className="space-y-1.5">
          <Label htmlFor={`template-var-${name}`}>{name}</Label>
          <Input
            id={`template-var-${name}`}
            value={values[name]}
            onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
            autoFocus={i === 0}
          />
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => dialog.closeAll()}>
          Cancel
        </Button>
        <Button type="submit">Insert</Button>
      </div>
    </form>
  )
}

/** Same glob semantics as the server's own channel matching (a trailing
 * `*` on the device's own subscription, never on the broadcast's target)
 * — good enough for a UI preview, not a reimplementation of
 * `ChannelRouterService::glob_match`. */
function deviceReceives(device: Device, channelId: string): boolean {
  return device.channels.some((pattern) => {
    if (pattern === channelId) return true
    if (pattern.endsWith('*')) return channelId.startsWith(pattern.slice(0, -1))
    return false
  })
}

export default function BroadcastingPage() {
  const dialog = useDialog()
  const [searchParams] = useSearchParams()
  // Prefilled by the sidebar's channel list — see AppSidebar's goToChannel().
  const [channelId, setChannelId] = useState(searchParams.get('channel') ?? '')
  const [payload, setPayload] = useState('')
  const [isSending, setSending] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [lastReach, setLastReach] = useState<{ channelId: string; count: number } | null>(null)

  // Scoped to whichever channel is currently typed — not a persisted log
  // per channel, a genuine reset: switch away and back and it's empty
  // again, matching "history reset" literally rather than remembering a
  // per-channel history behind the scenes.
  const [sentHistory, setSentHistory] = useState<{ id: string; payload: string; sentAt: string }[]>([])
  const [historyChannel, setHistoryChannel] = useState(channelId.trim())

  useEffect(() => {
    getTemplatesAction()
      .then(setTemplates)
      .catch(() => {
        // Templates are a convenience here, not required to send — a
        // failed fetch shouldn't block the compose form.
      })
  }, [])

  useEffect(() => {
    getDevicesAction()
      .then(setDevices)
      .catch((err) => toast.error(errorMessage(err, 'Failed to load connected devices.')))
  }, [])

  useEffect(() => {
    getChannelsAction()
      .then(setChannels)
      .catch((err) => toast.error(errorMessage(err, 'Failed to load channels.')))
  }, [])

  useEffect(() => {
    const trimmed = channelId.trim()
    if (trimmed !== historyChannel) {
      setSentHistory([])
      setHistoryChannel(trimmed)
    }
  }, [channelId, historyChannel])

  // Auto-grows with content like the chat-prompt inputs this is modeled
  // on, capped so a long paste doesn't push the floating composer off
  // the top of a short viewport.
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [payload])

  const [channelOpen, setChannelOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [variableOpen, setVariableOpen] = useState(false)
  const [variableName, setVariableName] = useState('')
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const channelBoxRef = useRef<HTMLDivElement>(null)
  const emojiBoxRef = useRef<HTMLDivElement>(null)
  const variableBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (channelBoxRef.current && !channelBoxRef.current.contains(event.target as Node)) setChannelOpen(false)
      if (emojiBoxRef.current && !emojiBoxRef.current.contains(event.target as Node)) setEmojiOpen(false)
      if (variableBoxRef.current && !variableBoxRef.current.contains(event.target as Node)) setVariableOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Variables already present in the message, offered as one-click
  // re-insertions above the "type a new one" input — same
  // `{{variable}}` convention as `extractTemplateVariables` uses for a
  // clicked template (see this file's own copy of that helper).
  const usedVariables = useMemo(() => extractTemplateVariables(payload), [payload])

  // Keeps whatever's already typed for a variable still present, drops
  // ones no longer in the message, blanks any newly-detected ones —
  // synced whenever the dropdown is open rather than only on open, since
  // `usedVariables` can change while it's sitting open (typing directly
  // in the textarea behind it).
  useEffect(() => {
    if (!variableOpen) return
    setVariableValues((prev) => {
      const next: Record<string, string> = {}
      for (const name of usedVariables) next[name] = prev[name] ?? ''
      return next
    })
  }, [variableOpen, usedVariables])

  const payloadBytes = new TextEncoder().encode(payload).length
  const overLimit = payloadBytes > MAX_PAYLOAD_BYTES

  // Warn once on crossing the limit rather than on every keystroke over
  // it — the send button is already disabled by `overLimit`, so this is
  // purely a nudge, not a gate: the textarea itself stays unrestricted.
  const wasOverLimitRef = useRef(false)
  useEffect(() => {
    if (overLimit && !wasOverLimitRef.current) {
      toast.warning(`Over the ${MAX_PAYLOAD_BYTES}-byte payload limit — keep writing, but trim it before you can send.`)
    }
    wasOverLimitRef.current = overLimit
  }, [overLimit])

  const matchingDevices = useMemo(() => {
    const trimmed = channelId.trim()
    if (!trimmed) return []
    return devices.filter((d) => deviceReceives(d, trimmed))
  }, [devices, channelId])

  // Channel search-select — a plain text input with a filtered dropdown
  // underneath, not a closed <select>: an arbitrary not-yet-existing
  // channel must stay typeable, since channels are never a persisted
  // registry (see `Channel`'s own doc comment).
  const channelSuggestions = useMemo(() => {
    const query = channelId.trim().toLowerCase()
    const matches = query ? channels.filter((c) => c.channel_id.toLowerCase().includes(query)) : channels
    return matches.slice(0, 8)
  }, [channels, channelId])

  function applyTemplate(template: Template) {
    const variables = extractTemplateVariables(template.body)
    if (variables.length === 0) {
      setPayload(template.body)
      return
    }
    dialog.openDialog(
      <TemplateVariablesForm body={template.body} variables={variables} onFilled={setPayload} />,
      { title: `Fill in "${template.name}"`, description: 'These placeholders were found in the template.', size: 'sm' },
    )
  }

  function insertEmoji(emoji: string) {
    setPayload((prev) => prev + emoji)
    setEmojiOpen(false)
    textareaRef.current?.focus()
  }

  function insertVariable(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setPayload((prev) => prev + `{{${trimmed}}}`)
    setVariableName('')
    setVariableOpen(false)
    textareaRef.current?.focus()
  }

  function applyVariableValues(event: FormEvent) {
    event.preventDefault()
    setPayload((prev) => fillTemplateVariables(prev, variableValues))
    setVariableOpen(false)
    textareaRef.current?.focus()
  }

  function handleAttachClick() {
    fileInputRef.current?.click()
  }

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setAttachedFileName(file.name)
    toast.info('Heads up: the wire protocol carries text only (211 UTF-8 bytes, no binary frames) — the filename below is a visual note, the file itself is never sent.')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (overLimit) return
    setSending(true)
    try {
      const targetChannel = channelId.trim()
      // Snapshot before sending — publish() doesn't wait for/report
      // delivery (no ACK in the protocol, see DOCS.md's AUTH caveat for
      // the same reason applied to messages), so "reach" here means
      // "currently subscribed", not a confirmed receipt.
      const reachCount = matchingDevices.length
      await sendBroadcastAction({ channelId: targetChannel, payload })
      setLastReach({ channelId: targetChannel, count: reachCount })
      setSentHistory((prev) => [{ id: randomId(), payload, sentAt: new Date().toISOString() }, ...prev])
      toast.success(`Published to "${targetChannel}" — ${reachCount} device${reachCount === 1 ? '' : 's'} currently subscribed.`)
      setPayload('')
      setAttachedFileName(null)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to send broadcast.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Broadcasting</h1>
        <p className="text-sm text-muted-foreground">Publish a message to any channel right now.</p>
      </div>

      {lastReach && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-600/20 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          <Radio className="h-4 w-4 shrink-0" />
          <span>
            Last broadcast to <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">{lastReach.channelId}</code> reached{' '}
            <span className="font-semibold tabular-nums">{lastReach.count}</span> device{lastReach.count === 1 ? '' : 's'}.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Sent history</CardTitle>
            <CardDescription>
              {channelId.trim() ? (
                <>
                  Messages sent to <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{channelId.trim()}</code> this
                  session — clears when you change the channel.
                </>
              ) : (
                'Type a channel in the composer below to start a history for it.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing sent to this channel yet.</p>
            ) : (
              <ul className="space-y-2">
                {sentHistory.map((entry) => (
                  <li key={entry.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap break-words">{entry.payload}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(entry.sentAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Reach</CardTitle>
            <CardDescription>
              Devices currently subscribed to this channel — a live snapshot, not a delivery receipt (the protocol
              has no per-message ACK).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums">{matchingDevices.length}</span>
              <span className="text-sm text-muted-foreground">device{matchingDevices.length === 1 ? '' : 's'}</span>
            </div>
            {!channelId.trim() ? (
              <p className="text-sm text-muted-foreground">Enter a channel to see who's listening.</p>
            ) : matchingDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No devices currently subscribed to this channel.</p>
            ) : (
              <ul className="space-y-1.5">
                {matchingDevices.map((device) => (
                  <li
                    key={device.session_id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate font-mono">{device.sub}</span>
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                      {formatDateTime(device.connected_at)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-sm border border-[orangered]/25 bg-primary/5 shadow-none">
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
                  onClick={() => applyTemplate(template)}
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

      {/* Compose — fixed at the bottom of the viewport, horizontally
          centered, not in the document flow like the cards above: the
          actual chat-prompt pattern (rounded pill, minimal chrome, inline
          send button) pinned in place rather than scrolling with the page. */}
      <div className="fixed bottom-12 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2">
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/40"
        >
          {/* Channel — a search-select, not a plain text field: an
              obviously-clickable pill with a chevron, backed by a filtered
              dropdown of known channels, but still free-typeable for a
              brand-new one. */}
          <div ref={channelBoxRef} className="relative border-b border-border/60 px-3 pb-1.5 pt-2">
            <button
              type="button"
              onClick={() => setChannelOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5"
            >
              <Hash className="h-3.5 w-3.5 shrink-0 text-primary" />
              <input
                value={channelId}
                onChange={(e) => {
                  setChannelId(e.target.value)
                  setChannelOpen(true)
                }}
                onFocus={() => setChannelOpen(true)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Search or type a channel…"
                aria-label="Channel"
                maxLength={24}
                required
                className="min-w-0 flex-1 bg-transparent font-mono text-xs font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
              />
              {channelId.trim() && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{matchingDevices.length} listening</span>
              )}
              <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', channelOpen && 'rotate-180')} />
            </button>

            {channelOpen && channelSuggestions.length > 0 && (
              <div className="absolute inset-x-3 bottom-full z-10 mb-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-card/95 p-1 text-foreground shadow-lg backdrop-blur-md">
                {channelSuggestions.map((c) => (
                  <button
                    key={c.channel_id}
                    type="button"
                    onClick={() => {
                      setChannelId(c.channel_id)
                      setChannelOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                  >
                    <span className="truncate font-mono">{c.channel_id}</span>
                    <Badge variant="neutral" className="shrink-0 px-1.5 py-0 text-[10px] tabular-nums">
                      {c.subscriber_count}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          {attachedFileName && (
            <div className="mx-3 mt-2 flex w-fit items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs">
              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="max-w-40 truncate">{attachedFileName}</span>
              <button
                type="button"
                onClick={() => setAttachedFileName(null)}
                aria-label="Remove attachment"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="px-2 pb-2 pt-1">
            <textarea
              ref={textareaRef}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder="Message this channel…"
              aria-label="Message"
              rows={1}
              required
              className="max-h-40 min-h-[2.5rem] w-full resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />

            {/* Icon row lives at the bottom of the textarea, not beside
                it — matches the chat-prompt pattern this composer is
                modeled on. The variable inserter sits at the left, apart
                from the attach/emoji/send group on the right. */}
            <div className="flex items-center justify-between gap-1">
              <div ref={variableBoxRef} className="relative shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setVariableOpen((v) => !v)}
                  className="h-9 w-9 rounded-full text-muted-foreground"
                  aria-label="Insert a template variable"
                >
                  <Braces className="h-4 w-4" />
                </Button>
                {variableOpen && (
                  <div className="absolute bottom-0 right-full z-10 mr-3 w-64 rounded-xl border border-border bg-card/95 p-3 text-foreground shadow-lg backdrop-blur-md">
                    <p className="mb-2 text-xs font-semibold text-foreground">Insert variable</p>

                    {usedVariables.length > 0 ? (
                      <form onSubmit={applyVariableValues} className="mb-3 space-y-2">
                        {usedVariables.map((name, i) => (
                          <div key={name} className="space-y-1">
                            <label htmlFor={`var-value-${name}`} className="block font-mono text-[11px] text-muted-foreground">
                              {`{{${name}}}`}
                            </label>
                            <input
                              id={`var-value-${name}`}
                              value={variableValues[name] ?? ''}
                              onChange={(e) => setVariableValues((prev) => ({ ...prev, [name]: e.target.value }))}
                              placeholder="value"
                              autoFocus={i === 0}
                              className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                            />
                          </div>
                        ))}
                        <Button type="submit" size="sm" className="h-7 w-full text-xs">
                          Apply values
                        </Button>
                      </form>
                    ) : (
                      <p className="mb-3 text-xs text-muted-foreground">No variable in this message yet.</p>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        insertVariable(variableName)
                      }}
                      className="flex items-center gap-1.5 border-t border-border pt-2"
                    >
                      <input
                        value={variableName}
                        onChange={(e) => setVariableName(e.target.value)}
                        placeholder="variableName"
                        aria-label="New variable name"
                        autoFocus={usedVariables.length === 0}
                        className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <Button type="submit" size="sm" disabled={!variableName.trim()} className="h-7 shrink-0 px-2 text-xs">
                        Insert
                      </Button>
                    </form>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleAttachClick}
                  className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
                  aria-label="Attach a file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" />

                <div ref={emojiBoxRef} className="relative shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setEmojiOpen((v) => !v)}
                    className="h-9 w-9 rounded-full text-muted-foreground"
                    aria-label="Insert emoji"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                  {emojiOpen && (
                    <EmojiPicker.Root
                      onEmojiSelect={(emoji) => insertEmoji(emoji.emoji)}
                      columns={8}
                      className="absolute bottom-full right-0 z-10 mb-2 flex h-80 w-72 flex-col overflow-hidden rounded-xl border border-border bg-card/95 text-foreground shadow-lg backdrop-blur-md"
                    >
                      <div className="relative shrink-0 p-2">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <EmojiPicker.Search
                          placeholder="Search emoji…"
                          className="w-full rounded-md border border-input bg-transparent py-1.5 pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                      <EmojiPicker.Viewport className="min-h-0 flex-1 overflow-y-auto">
                        <EmojiPicker.Loading className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          Loading…
                        </EmojiPicker.Loading>
                        <EmojiPicker.Empty className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          No emoji found.
                        </EmojiPicker.Empty>
                        <EmojiPicker.List
                          className="select-none pb-1.5"
                          components={{
                            CategoryHeader: ({ category, ...props }) => (
                              <div
                                className="bg-card/95 px-3 pb-1.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-md"
                                {...props}
                              >
                                {category.label}
                              </div>
                            ),
                            Row: ({ children, ...props }) => (
                              <div className="px-1.5" {...props}>
                                {children}
                              </div>
                            ),
                            Emoji: ({ emoji, ...props }) => (
                              <button
                                className={cn(
                                  'flex h-7 w-7 items-center justify-center rounded text-base transition-colors',
                                  emoji.isActive && 'bg-muted',
                                )}
                                {...props}
                              >
                                {emoji.emoji}
                              </button>
                            ),
                          }}
                        />
                      </EmojiPicker.Viewport>
                    </EmojiPicker.Root>
                  )}
                </div>

                <Button
                  type="submit"
                  size="icon"
                  disabled={isSending || overLimit || !channelId.trim() || !payload}
                  className="h-9 w-9 shrink-0 rounded-full"
                  aria-label={isSending ? 'Sending…' : 'Send broadcast'}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <p className={`px-4 pb-2 text-right text-[10px] tabular-nums ${overLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
            {payloadBytes} / {MAX_PAYLOAD_BYTES} bytes
          </p>
        </form>
      </div>
    </div>
  )
}
