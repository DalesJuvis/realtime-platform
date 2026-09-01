# Sequence — Web Push (VAPID) notification

Context: `backend/src/modules/push` (`WebPushAdapter`, `WebPushCrypto`) +
`backend/src/modules/realtime` (`PushSubscriptionController`,
`RegisterPushSubscriptionUseCase`, `PushFallbackService`), client side
`sdk-typescript/src/notifications.ts` (`registerPushServiceWorker`,
`subscribeToPush`) + a service worker (`push`/`notificationclick`
handlers). Delivers a notification even with the tab or browser fully
closed — the thing `attachBackgroundNotifications`'s tab-hidden
`Notification` can't do (see DOCS.md's Web Push section).

Backfilled after the feature existed, at the user's request — not written
alongside the original implementation.

## 1. Subscribe (once, on a user gesture)

```
   App               Browser                                Backend API                DB
 (your page)     (PushManager + SW)                   /api/v1/push/subscriptions   (push_subscriptions)
     |                    |                                      |                        |
     |--registerPushServiceWorker(swUrl)--------------------->|                           |
     |                    |--navigator.serviceWorker            |                        |
     |                    |    .register(swUrl)---------------->|  (installs sw.js)      |
     |<---ServiceWorkerRegistration---------------------------|                           |
     |                    |                                      |                        |
     |--subscribeToPush(registration, vapidPublicKeyB64Url)-->|                           |
     |                    |--pushManager.getSubscription()       |                        |
     |                    |   (reuse if one already exists)      |                        |
     |                    |--else pushManager.subscribe({        |                        |
     |                    |     userVisibleOnly: true,            |                       |
     |                    |     applicationServerKey:             |                       |
     |                    |       vapidPublicKeyB64Url })         |                       |
     |                    |<--PushSubscription                    |                       |
     |                    |     { endpoint, getKey("p256dh"),     |                       |
     |                    |       getKey("auth") }                |                       |
     |<---{endpoint, keys: {p256dh, auth}}---------------------|                           |
     |                    |                                      |                        |
     |--POST /api/v1/push/subscriptions----------------------------------------------->|  |
     |  Authorization: Bearer <client token>                                              |
     |  { tenant_id, endpoint, keys: {p256dh, auth},                                      |
     |    channels: ["orders:*"] }  -- glob patterns, same syntax as a normal SUBSCRIBE    |
     |                    |                                      |--auth.validate(------->|
     |                    |                                      |    tenant_id, token)   |
     |                    |                                      |--upsert by endpoint---->|
     |                    |                                      |<--ok--------------------|
     |<---{registered: true}-----------------------------------------------------------|  |
```

`vapidPublicKeyB64Url` is the server's `VapidKeys::public_key_b64url()` —
handed to the app out of band (e.g. baked into the frontend build), not
fetched through this API. Unregister is the same shape, `DELETE` by
`{tenant_id, endpoint}` only.

## 2. Publish → local-delivery-first → Web Push fallback

```
  Publisher        PushFallbackService                    WebPushAdapter              Push Service          Browser + SW
 (SDK publish /   (publish_and_fanout,                       (per subscription,      (vendor's push          (tab closed
  portal broadcast)  one call per message)                     VAPID)                  endpoint)              or backgrounded)
     |                     |                                      |                        |                       |
     |--publish(tenant, channel, payload)--------------------->|                            |                       |
     |                     |--channel_router.publish(...)          |                        |                       |
     |                     |    delivers over every open WS/TCP    |                        |                       |
     |                     |    socket subscribed to this channel  |                        |                       |
     |                     |<--local_subscribers: usize-------------|                       |                       |
     |                     |                                      |                        |                       |
     |              [local_subscribers > 0]                        |                        |                       |
     |                     |--done. Nobody needed the fallback -- a live socket already got it.
     |                     |                                      |                        |                       |
     |              [local_subscribers == 0 -- nobody on this instance has an open socket]  |                       |
     |                     |                                      |                        |                       |
     |                     |--push_subscriptions.find_matching(   |                        |                       |
     |                     |    tenant_id, channel_id)             |                        |                       |
     |                     |    exact match, or glob against       |                        |                       |
     |                     |    each stored pattern (e.g. orders:*)|                        |                       |
     |                     |<--matching PushSubscription[]---------|                        |                       |
     |                     |                                      |                        |                       |
     |                     |--submit(build_web_push_job(...))--->|                          |                       |
     |                     |   one job, N subscriptions            |--per subscription:      |                       |
     |                     |                                      |  encrypt_aes128gcm(     |                       |
     |                     |                                      |    payload, p256dh, auth)|                      |
     |                     |                                      |   1. fresh ephemeral     |                      |
     |                     |                                      |      P-256 keypair + salt|                      |
     |                     |                                      |   2. ECDH(as_priv,       |                      |
     |                     |                                      |        subscriber p256dh)|                      |
     |                     |                                      |   3. HKDF-SHA256 x2       |                      |
     |                     |                                      |      -> CEK(16B)/nonce(12B)|                     |
     |                     |                                      |   4. AES-128-GCM(         |                      |
     |                     |                                      |        payload || 0x02)   |                      |
     |                     |                                      |                        |                       |
     |                     |                                      |--POST endpoint-------->|                       |
     |                     |                                      |  Content-Encoding:      |                       |
     |                     |                                      |    aes128gcm            |                       |
     |                     |                                      |  TTL: 2419200            |                       |
     |                     |                                      |  Authorization: vapid    |                       |
     |                     |                                      |    t=<ES256 JWT,         |                       |
     |                     |                                      |       aud+exp+sub>,      |                       |
     |                     |                                      |    k=<VAPID public key>  |                       |
     |                     |                                      |<--202 Accepted----------|                       |
     |                     |                                      |  (queued for delivery,   |                       |
     |                     |                                      |   not a receipt — see    |                       |
     |                     |                                      |   caveat below)          |                       |
     |                     |                                      |                        |--wakes the browser--->|
     |                     |                                      |                        |  (OS push channel,    |
     |                     |                                      |                        |   even app-closed)    |
     |                     |                                      |                        |                       |--browser decrypts
     |                     |                                      |                        |                       |  using the same
     |                     |                                      |                        |                       |  subscription keys
     |                     |                                      |                        |                       |--sw.js 'push' event
     |                     |                                      |                        |                       |  event.data.text()
     |                     |                                      |                        |                       |--self.registration.
     |                     |                                      |                        |                       |   showNotification(
     |                     |                                      |                        |                       |     title, {body,
     |                     |                                      |                        |                       |      icon, tag})
     |                     |                                      |                        |                       |  user sees it
     |                     |                                      |                        |                       |
     |                     |                                      |                        |                       |--(later) click ->
     |                     |                                      |                        |                       |  focus existing tab,
     |                     |                                      |                        |                       |  or clients.openWindow
```

## Notes

- **The fallback only fires when `local_subscribers == 0` on *this*
  instance**, checked right after the local WS fan-out, before Web Push
  is even considered — a live socket always wins, Web Push is strictly
  the "nobody's listening right now" path. If a cluster (`ClusterBroadcastPort`)
  is configured, the cluster broadcast happens independently of that
  count, so another instance's WS subscribers still get it live; the
  local `local_subscribers == 0` check only gates *this instance's* Web
  Push fallback.
- **`202 Accepted` from the push service is not a delivery receipt** —
  it means the vendor's push infrastructure queued the message. Actual
  delivery to the device still depends on the OS/browser waking it,
  which is entirely outside this platform's (or any server's) control —
  same caveat DOCS.md states for the whole feature.
- **A `404`/`410` from the push service means the subscription is
  stale** (uninstalled, permission revoked, browser storage cleared) —
  not yet auto-pruned from `push_subscriptions` by this flow.
- **VAPID keys are used for exactly one thing**: signing the
  `Authorization: vapid t=..., k=...` JWT so the push service can verify
  *this server* is who it claims to be — they are not part of the
  payload encryption itself (that's `p256dh`/`auth`, unique per
  subscription, established during `pushManager.subscribe`).
