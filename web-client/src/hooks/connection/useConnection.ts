/**
 * # useConnection
 *
 * Composes `connection.store` with toast feedback and chat-subscription
 * rehydration: whenever the connection reaches `open`, every previously
 * joined channel is re-subscribed on the new client (a fresh `connect()`
 * creates a brand new `RealtimeClient`, which starts with no subscriptions).
 */

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useConnectionStore } from '@store/connection.store'
import { useChatStore } from '@store/chat.store'
import type { ConnectionCredentials } from '@entities/Connection.entity'

export function useConnection() {
  const status = useConnectionStore((s) => s.status)
  const credentials = useConnectionStore((s) => s.credentials)
  const lastError = useConnectionStore((s) => s.lastError)
  const storeConnect = useConnectionStore((s) => s.connect)
  const storeDisconnect = useConnectionStore((s) => s.disconnect)
  const rehydrateSubscriptions = useChatStore((s) => s.rehydrateSubscriptions)

  const previousStatus = useRef(status)

  useEffect(() => {
    if (previousStatus.current !== 'open' && status === 'open') {
      rehydrateSubscriptions()
      toast.success('Connected', { description: credentials?.wsUrl })
    }
    if (previousStatus.current === 'open' && status === 'closed') {
      toast.warning('Connection closed', { description: 'Attempting to reconnect…' })
    }
    if (status === 'error' && lastError) {
      toast.error('Connection error', { description: lastError })
    }
    previousStatus.current = status
  }, [status, lastError, credentials?.wsUrl, rehydrateSubscriptions])

  const connect = useCallback((creds: ConnectionCredentials) => storeConnect(creds), [storeConnect])
  const disconnect = useCallback(() => storeDisconnect(), [storeDisconnect])

  return {
    status,
    credentials,
    lastError,
    isConnected: status === 'open',
    connect,
    disconnect,
  }
}
