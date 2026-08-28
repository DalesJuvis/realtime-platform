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
import { attachBackgroundNotifications, type RealtimeClient, type RealtimeMessage, type Unsubscribe } from '@mio/realtime-sdk'
import type { ConnectionCredentials, ConnectionStatus } from '@entities/Connection.entity'
import { createRealtimeConnectionAction } from '@actions/realtime/createRealtimeConnection.action'

type MessageListener = (message: RealtimeMessage) => void

/** The live client instance — not persisted, not part of render-diffed state. */
let activeClient: RealtimeClient | null = null
/** Detaches the previous client's OS-notification listener (see `connect`
 * below) before attaching a new one — otherwise reconnecting would stack
 * a second listener on top rather than replacing it. */
let detachBackgroundNotifications: Unsubscribe | null = null

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
        detachBackgroundNotifications?.()

        const client = createRealtimeConnectionAction(creds)
        activeClient = client

        client.on('open', () => set({ status: 'open', lastError: null }))
        client.on('close', () => set((s) => ({ status: s.status === 'error' ? s.status : 'closed' })))
        client.on('error', (err) => set({ status: 'error', lastError: err.message }))

        // Real OS-level notification, distinct from the in-app bell
        // (`notifications.store`): fires only while the tab is hidden/
        // unfocused, so it never doubles up with the bell while you're
        // actually looking at the app. Silently a no-op until
        // `Notification.requestPermission()` has been granted (see
        // `PushNotificationToggle`) — never prompts on its own.
        detachBackgroundNotifications = attachBackgroundNotifications(client, {
          title: (m) => `#${m.channelId}`,
          onClick: () => window.focus(),
        })

        set({ credentials: creds, status: 'connecting', lastError: null })
        client.connect()
      },

      disconnect: () => {
        activeClient?.disconnect()
        activeClient = null
        detachBackgroundNotifications?.()
        detachBackgroundNotifications = null
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
