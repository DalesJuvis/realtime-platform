/**
 * # ConnectionStore
 *
 * Owns the single `RealtimeClient` instance and its live status. Other
 * stores (chat) reach the client only through the `subscribeChannel` /
 * `publish` passthroughs exposed here — never by importing the SDK
 * directly — so this store stays the one place that knows a connection
 * exists at all. Credentials are persisted (localStorage) so a page
 * refresh doesn't force re-pasting the token; this is a local dev/demo
 * tool, not a production auth flow.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { RealtimeClient, RealtimeMessage, Unsubscribe } from '@yourorg/realtime-sdk'
import type { ConnectionCredentials, ConnectionStatus } from '@entities/Connection.entity'
import { createRealtimeConnectionAction } from '@actions/realtime/createRealtimeConnection.action'

type MessageListener = (message: RealtimeMessage) => void

/** The live client instance — not persisted, not part of render-diffed state. */
let activeClient: RealtimeClient | null = null

interface ConnectionState {
  readonly credentials: ConnectionCredentials | null
  readonly status: ConnectionStatus
  readonly lastError: string | null

  connect: (creds: ConnectionCredentials) => void
  disconnect: () => void
  onMessage: (listener: MessageListener) => Unsubscribe
  subscribeChannel: (channelId: string, handler: MessageListener) => Unsubscribe
  publish: (channelId: string, payload: string) => void
  replay: (channelId: string, sinceUnixSeconds?: number) => void
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      credentials: null,
      status: 'idle',
      lastError: null,

      connect: (creds) => {
        activeClient?.disconnect()

        const client = createRealtimeConnectionAction(creds)
        activeClient = client

        client.on('open', () => set({ status: 'open', lastError: null }))
        client.on('close', () => set((s) => ({ status: s.status === 'error' ? s.status : 'closed' })))
        client.on('error', (err) => set({ status: 'error', lastError: err.message }))

        set({ credentials: creds, status: 'connecting', lastError: null })
        client.connect()
      },

      disconnect: () => {
        activeClient?.disconnect()
        activeClient = null
        set({ credentials: null, status: 'idle', lastError: null })
      },

      onMessage: (listener) => {
        if (!activeClient) return () => {}
        return activeClient.on('message', listener)
      },

      subscribeChannel: (channelId, handler) => {
        if (!activeClient) return () => {}
        return activeClient.subscribe(channelId, handler)
      },

      publish: (channelId, payload) => {
        activeClient?.publish(channelId, payload)
      },

      replay: (channelId, sinceUnixSeconds) => {
        activeClient?.replay(channelId, sinceUnixSeconds)
      },
    }),
    {
      name: 'connection-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ credentials: state.credentials }),
    },
  ),
)
