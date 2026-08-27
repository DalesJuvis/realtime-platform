/**
 * # ChannelsPage
 *
 * Every channel this tenant currently has live state for, polled every
 * 5s. Channels aren't a persisted registry server-side — one exists the
 * moment something SUBs or PUBs on it (see `getChannelsAction`'s doc
 * comment) — so this is a live view, not a CRUD list.
 */

import { useEffect, useState } from 'react'
import { Hash, Radio } from 'lucide-react'
import { Card, CardContent } from '@components/ui/card'
import { Badge } from '@components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@components/ui/table'
import { getChannelsAction } from '@actions/channels/getChannels.action'
import type { Channel } from '@entities/Channel.entity'

const POLL_INTERVAL_MS = 5_000

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await getChannelsAction()
        if (!cancelled) setChannels(data)
      } catch {
        // transient network hiccup — next poll tick retries
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
          <p className="text-sm text-muted-foreground">Channels currently in use, with their live subscriber count.</p>
        </div>
        <Badge variant="secondary">{channels?.length ?? 0} active</Badge>
      </div>

      <Card className="shadow-none">
        <CardContent className="p-0">
          {channels && channels.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No channels yet — one appears here the moment a client subscribes or publishes.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Subscribers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(channels ?? []).map((channel) => (
                  <TableRow key={channel.channel_id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        {channel.channel_id}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <Radio className="h-3.5 w-3.5" />
                        {channel.subscriber_count}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
