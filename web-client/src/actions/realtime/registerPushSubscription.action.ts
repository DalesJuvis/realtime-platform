/**
 * # registerPushSubscriptionAction
 *
 * Action:  Registers this browser for Web Push on the currently connected
 *          tenant — the only way messages can still reach it once the tab
 *          is closed (a live WS connection, what the rest of this app
 *          uses, obviously can't: closing the tab ends it). Requests
 *          notification permission, registers `public/sw.js`, subscribes
 *          via the SDK's `subscribeToPush`, then POSTs the subscription
 *          to this backend's `POST /api/v1/push/subscriptions`.
 * Input:   `ConnectionCredentials` (for `tenantId`/`token`), the derived
 *          Portal API HTTP base URL.
 * Output:  void — throws on any step's failure (permission denied,
 *          unsupported browser, network error), left for the caller to
 *          surface (see `PushNotificationToggle`).
 *
 * Subscribes to `channels: ['*']` — this demo client has no fixed channel
 * list to scope it to (channel ids are typed in ad hoc), and `'*'`
 * matches every channel of the tenant via the same glob logic the backend
 * already uses for WS wildcard `SUB` (see `ChannelRouterService::glob_match`).
 * A real product would likely scope this to whatever channels the user
 * actually cares about instead of "everything."
 */

import { registerPushServiceWorker, requestNotificationPermission, subscribeToPush } from '@mio/realtime-sdk'
import type { ConnectionCredentials } from '@entities/Connection.entity'

/** Portal API convention in this repo: same host as the WS endpoint, port
 * 8090 instead of 8080, no `/ws` path (see `backend/settings.rs`'s
 * `portal_bind_addr` / `docker-compose.yml`). */
function derivePortalApiUrl(wsUrl: string): string {
  const url = new URL(wsUrl)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.port = '8090'
  url.pathname = ''
  return url.toString().replace(/\/$/, '')
}

export async function registerPushSubscriptionAction(creds: ConnectionCredentials, vapidPublicKey: string): Promise<void> {
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error(`Notification permission was "${permission}", not "granted".`)
  }

  const registration = await registerPushServiceWorker('/sw.js')
  const subscription = await subscribeToPush(registration, vapidPublicKey)

  const res = await fetch(`${derivePortalApiUrl(creds.wsUrl)}/api/v1/push/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.token}` },
    body: JSON.stringify({
      tenant_id: creds.tenantId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      channels: ['*'],
    }),
  })
  if (!res.ok) {
    throw new Error(`Push subscription registration failed (${res.status}).`)
  }
}

export async function unregisterPushSubscriptionAction(creds: ConnectionCredentials): Promise<void> {
  const registration = await registerPushServiceWorker('/sw.js')
  const existing = await registration.pushManager.getSubscription()
  if (!existing) return

  const endpoint = existing.endpoint
  await existing.unsubscribe()

  const res = await fetch(`${derivePortalApiUrl(creds.wsUrl)}/api/v1/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.token}` },
    body: JSON.stringify({ tenant_id: creds.tenantId, endpoint }),
  })
  if (!res.ok) {
    throw new Error(`Push subscription removal failed (${res.status}).`)
  }
}
