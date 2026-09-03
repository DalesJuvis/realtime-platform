/**
 * # registerPortalPushAction / unregisterPortalPushAction
 *
 * Action:   Subscribes this browser to real Web Push (notifications with
 *           the tab or browser fully closed) for every channel of the
 *           signed-in tenant — requests Notification permission, registers
 *           `/sw.js`, subscribes via the SDK's `subscribeToPush`, then
 *           mints a short-lived client token purely to authenticate the
 *           registration call itself.
 * Endpoint: POST/DELETE /api/v1/push/subscriptions
 *
 * That endpoint is client-token-authenticated (`realtime::routes`), not
 * portal-session-authenticated — this app only ever holds a portal
 * session, never a client token, so a fresh one is minted on demand via
 * the already-portal-session-authenticated `POST /api/v1/portal/tokens`
 * (same call `MintTokenCard` makes). The token only has to be valid for
 * this one registration request: once the subscription row exists,
 * nothing re-checks that token at publish time.
 *
 * Deliberately bypasses the shared `http` axios instance — its request
 * interceptor unconditionally overwrites `Authorization` with the portal
 * session token (see `lib/http.ts`), which would clobber the client
 * token this call actually needs. Same reasoning `web-client`'s own
 * `registerPushSubscription.action.ts` already applies with a plain
 * `fetch` there.
 *
 * Sends a `device_label` (the SDK's own `guessDeviceLabel()`) alongside
 * the subscription — `endpoint` was already what makes registering from a
 * second device (a phone, another browser) add a row instead of
 * overwriting the first one, this only makes the backend's stored rows
 * identifiable instead of a list of opaque push-service URLs.
 */

import {
  registerPushServiceWorker,
  requestNotificationPermission,
  subscribeToPush,
  guessDeviceLabel,
} from '@mio/realtime-sdk'
import { mintTokenAction } from '@actions/overview/mintToken.action'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { env } from '@lib/env'

/** Not a real end-user identity — this subscription belongs to whoever
 * is signed into the portal for this tenant, not a specific `sub` the
 * rest of the platform's messaging model would recognize. */
const PORTAL_PUSH_SUB = 'tenant-portal-admin'

export async function registerPortalPushAction(vapidPublicKey: string): Promise<void> {
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error(`Notification permission was "${permission}", not "granted".`)
  }

  const registration = await registerPushServiceWorker('/sw.js')
  const subscription = await subscribeToPush(registration, vapidPublicKey)
  const [minted, keys] = await Promise.all([mintTokenAction({ sub: PORTAL_PUSH_SUB }), getKeysAction()])

  const res = await fetch(`${env.defaultApiUrl}/api/v1/push/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${minted.token}` },
    body: JSON.stringify({
      tenant_id: keys.tenantId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      channels: ['*'],
      device_label: guessDeviceLabel(),
    }),
  })
  if (!res.ok) {
    throw new Error(`Push subscription registration failed (${res.status}).`)
  }
}

export async function unregisterPortalPushAction(): Promise<void> {
  const registration = await registerPushServiceWorker('/sw.js')
  const existing = await registration.pushManager.getSubscription()
  if (!existing) return

  const endpoint = existing.endpoint
  await existing.unsubscribe()

  const [minted, keys] = await Promise.all([mintTokenAction({ sub: PORTAL_PUSH_SUB }), getKeysAction()])
  const res = await fetch(`${env.defaultApiUrl}/api/v1/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${minted.token}` },
    body: JSON.stringify({ tenant_id: keys.tenantId, endpoint }),
  })
  if (!res.ok) {
    throw new Error(`Push subscription removal failed (${res.status}).`)
  }
}
