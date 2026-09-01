/**
 * # ChannelsPage
 *
 * Every channel this tenant currently has live state for — real data,
 * polled every 5s via `DataTable`'s `refreshKey`. Channels aren't a
 * persisted registry server-side — one exists the moment something SUBs
 * or PUBs on it (see `getChannelsAction`'s doc comment), so `status` here
 * is derived client-side (subscriber count > 0), not a stored field.
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Hash, Radio } from 'lucide-react'
import { Badge } from '@components/ui/badge'
import { DataTable } from '@components/DataTable/DataTable'
import { getChannelsAction } from '@actions/channels/getChannels.action'
import { copyToClipboard } from '@lib/utils'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { Channel } from '@entities/Channel.entity'

const POLL_INTERVAL_MS = 5_000

type ChannelStatus = 'active' | 'idle'
type ChannelRow = Channel & { status: ChannelStatus }

async function loadChannels(): Promise<ChannelRow[]> {
  const channels = await getChannelsAction()
  return channels.map((c) => ({ ...c, status: c.subscriber_count > 0 ? 'active' : 'idle' }))
}

const STATUS_VARIANT: Record<ChannelStatus, 'success' | 'neutral'> = {
  active: 'success',
  idle: 'neutral',
}

const columns: ColumnDef<ChannelRow>[] = [
  {
    key: 'channel_id',
    header: 'Channel',
    sortable: true,
    renderCell: (_v, row) => (
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
        {row.channel_id}
      </span>
    ),
  },
  {
    key: 'subscriber_count',
    header: 'Subscribers',
    sortable: true,
    align: 'right',
    renderCell: (_v, row) => (
      <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
        <Radio className="h-3.5 w-3.5" />
        {row.subscriber_count}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    renderCell: (_v, row) => (
      <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
        {row.status}
      </Badge>
    ),
  },
]

export default function ChannelsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const source = useMemo(() => ({ type: 'request' as const, fn: loadChannels }), [])

  useEffect(() => {
    const interval = setInterval(() => setRefreshKey((k) => k + 1), POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
        <p className="text-sm text-muted-foreground">Channels currently in use, with their live subscriber count.</p>
      </div>

      <DataTable
        source={source}
        refreshKey={refreshKey}
        columns={columns}
        selectable
        getRowId={(row) => row.channel_id}
        exportFilename="channels"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'idle', label: 'Idle' },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: 'Copy channel ID',
            icon: Copy,
            onClick: async () => {
              try {
                await copyToClipboard(row.channel_id)
                toast.success('Channel ID copied.')
              } catch {
                toast.error('Failed to copy channel ID.')
              }
            },
          },
        ]}
        renderEmpty={() => (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No channels yet — one appears here the moment a client subscribes or publishes.
          </div>
        )}
      />
    </div>
  )
}
