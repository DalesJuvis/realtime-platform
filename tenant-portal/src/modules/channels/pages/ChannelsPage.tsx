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
import { useTranslation } from '@lib/i18n'
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

export default function ChannelsPage() {
  const { t } = useTranslation()
  const [refreshKey, setRefreshKey] = useState(0)
  const source = useMemo(() => ({ type: 'request' as const, fn: loadChannels }), [])

  const statusLabel: Record<ChannelStatus, string> = {
    active: t.common.active,
    idle: t.channels.idleStatus,
  }

  const columns: ColumnDef<ChannelRow>[] = [
    {
      key: 'channel_id',
      header: t.channels.channelColumn,
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
      header: t.channels.subscribersColumn,
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
      header: t.common.status,
      renderCell: (_v, row) => (
        <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
          {statusLabel[row.status]}
        </Badge>
      ),
    },
  ]

  useEffect(() => {
    const interval = setInterval(() => setRefreshKey((k) => k + 1), POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.channels.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.channels.pageSubtitle}</p>
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
            label: t.common.status,
            options: [
              { value: 'active', label: t.common.active },
              { value: 'idle', label: t.channels.idleStatus },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: t.channels.copyChannelId,
            icon: Copy,
            onClick: async () => {
              try {
                await copyToClipboard(row.channel_id)
                toast.success(t.common.copied(t.channels.channelIdLabel))
              } catch {
                toast.error(t.common.copyFailed(t.channels.channelIdLabel))
              }
            },
          },
        ]}
        renderEmpty={() => (
          <div className="py-16 text-center text-sm text-muted-foreground">{t.channels.emptyState}</div>
        )}
      />
    </div>
  )
}
