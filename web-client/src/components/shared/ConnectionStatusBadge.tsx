/**
 * # ConnectionStatusBadge
 *
 * Small colored dot + label reflecting `connection.store`'s live status.
 */

import { cn } from '@lib/utils'
import { useConnectionStore } from '@store/connection.store'
import type { ConnectionStatus } from '@entities/Connection.entity'

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  open: 'Connected',
  closed: 'Reconnecting…',
  error: 'Connection error',
}

const STATUS_DOT: Record<ConnectionStatus, string> = {
  idle: 'bg-muted-foreground',
  connecting: 'bg-yellow-500 animate-pulse',
  open: 'bg-emerald-500',
  closed: 'bg-yellow-500 animate-pulse',
  error: 'bg-destructive',
}

export function ConnectionStatusBadge() {
  const status = useConnectionStore((s) => s.status)

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  )
}
