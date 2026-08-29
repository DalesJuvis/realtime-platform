# mio Realtime Platform — Reference for AI Assistants

Single-file, dense reference for an AI assistant/agent that needs to
write, review, or debug code against this platform (a multi-tenant
realtime pub/sub engine: Rust backend, fixed 256-byte binary WS/TCP
protocol, a REST API, and SDKs for eight languages/frameworks). Give
this whole file as context instead of the narrative docs when the task
is "generate correct code against this API" — it trades prose for
exhaustive tables and explicit constraints.

Human-oriented docs with more explanation live at [`DOCS.md`](DOCS.md)
(same content, friendlier tone) and the in-app Docs page
(`tenant-portal` → Docs). This file is a superset: it also covers the
full REST surface (including Admin API) and the complete error-code
taxonomy, neither of which `DOCS.md` enumerates exhaustively.

**Ground truth is the source, not this file.** If a claim here looks
wrong or outdated, the authoritative reference is `backend/src/`
(protocol: `entities/Frame.rs`; each REST module's own
`routes.rs`/`controllers/`/`PortalError.rs`). This file was generated
by reading that source directly, but the source can change after it was
written.

## 1. Hard constraints — never violate these when generating code

1. **A tenant secret never leaves the server that holds it.** It is used
   exactly once, server-side, to mint a client token
   (`POST /api/v1/auth/tokens` or an SDK's `mintToken`). Never write code
   that sends a raw secret from a browser, mobile app, or any
   client-side context. Never hardcode a secret into a `<script>` tag,
   mobile app bundle, or public repo.
2. **No SDK mints its own token.** A token is always produced
   server-side (`TokenService::issue_token`/`issue_token_with_secret` in
   Rust, or the REST endpoint). Client code only ever *receives* an
   already-minted token string and passes it to `connect`/`token:`.
3. **`tenant_id` is public** — safe to embed in client-side code,
   config files, URLs. It is an identifier, not a credential.
4. **The fixed frame payload is 211 UTF-8 bytes.** Any SDK's
   `publish()`/`unicast()`/`emit()` chunk transparently above that; the
   stateless REST `POST /api/v1/messages` does **not** chunk and returns
   `400 INVALID_REQUEST` above the limit.
5. **`channel_id` is capped at 24 UTF-8 bytes.** Same cap applies to
   `userId` in `unicast()` (it reuses the same wire field).
6. **There is no AUTH acknowledgement opcode.** A client's
   `authenticated`/`open` event fires optimistically right after sending
   AUTH; a failed auth surfaces only as the server closing the
   connection (a `close` event, then reconnect if enabled). Never write
   code that assumes a synchronous "auth succeeded" signal exists.
7. **REPLAY only works on an exact `channel_id`, never a wildcard
   pattern** (`orders:*`) — the server silently no-ops a REPLAY on a
   pattern rather than erroring.

## 2. Core concepts (glossary)

| Term | Meaning |
|---|---|
| `tenant_id` | UUID identifying a tenant. Public. |
| tenant secret | HMAC key proving control of a tenant. Server-side only, ever. A tenant may have **multiple** valid secrets at once (see below) — any of them mints a working token. |
| primary secret | The one secret created at signup / shown at Settings → API keys. Rotating it (`POST /api/v1/portal/keys/rotate`) replaces it in place. |
| extra API key pair | An additional, independently named + independently revocable `(public_key, secret)` pair a tenant can generate (`POST /api/v1/portal/api-keys`), on top of the primary secret. Revoking one doesn't affect the primary secret or other extra pairs. |
| client token | Short-lived signed string (`payload_b64.signature_b64`, HMAC-SHA256), minted server-side from a valid secret, handed to an end-user's SDK/browser/app. This is what actually authenticates a WS/TCP connection or HTTP publish call. |
| `sub` | Arbitrary string identifying *who* a token is for (a user id) — encoded inside the token's payload, not verified against anything external. |
| `channel_id` | Routing key for pub/sub, ≤24 UTF-8 bytes. `orders:42` is a plain example convention (colon-delimited namespacing), not a protocol requirement. |
| wildcard pattern | A subscribe-only channel spec with a trailing `*` (`orders:*`) matching any concrete `channel_id` with that prefix. Cannot be published to or replayed. |
| frame | The fixed 256-byte binary unit every WS/TCP message is encoded as. See §7. |
| chunking | SDK-side (never protocol-side) splitting of a payload >211 bytes into multiple PUB/UNICAST frames, reassembled on the receiving end before the app-level handler fires. |

## 3. Auth model

```
1. Your own backend holds a tenant secret (primary or an extra key pair).
2. Your backend calls POST /api/v1/auth/tokens with {tenant_id, secret, sub, ttl_secs}.
3. The server verifies `secret` against ANY of the tenant's currently-active
   secrets (primary + extra pairs), and returns a signed token.
4. Your backend hands ONLY the token to the end user (browser/app).
5. The end user's SDK connects/authenticates with {tenantId, token} — never
   sees tenant_id+secret together, never sees the secret at all.
```

Token format (not a JWT, deliberately simpler to avoid `"alg":"none"`-style
attacks): `base64url(payload_json) + "." + base64url(HMAC_SHA256(payload_json, secret))`,
`payload_json = {"tenant_id": "<uuid>", "sub": "<string>", "exp": <unix_ts>}`.

Validation tries the tenant's primary secret first, then each active
extra key pair's secret, until one HMAC matches (O(k) in the tenant's
key count, not O(1) — a tenant with many keys pays a proportionally
larger validation cost per frame). A token is only as revocable as the
specific secret that signed it: revoking one extra key pair immediately
invalidates only tokens signed with *that* secret, not others.

## 4. REST API — full endpoint reference

Two listener ports (defaults, see `backend/.env`/`Settings`):
- **`:8090`** — Portal API (`/api/v1/portal/*`) + public Auth
  (`/api/v1/auth/*`) + public Messages/Push (`/api/v1/messages`,
  `/api/v1/push/subscriptions`). Safe to expose publicly.
- **`:9090`** — Admin API (`/api/v1/admin/*`, `/api/v1/system/*`).
  **Never expose publicly** — bound to `127.0.0.1` in every production
  compose file. Reach it via SSH tunnel.

### Envelope shapes (identical across every module)

Success:
```json
{ "success": true, "data": { /* endpoint-specific */ }, "trace_id": "<uuid-v4>" }
```
Error:
```json
{ "success": false, "error": { "code": "SOME_CODE", "message": "...", "trace_id": "<uuid-v4>" } }
```
Exceptions: `GET /api/v1/system/health` and `GET /api/v1/system/metrics`
return raw text, not this envelope. A malformed/unparseable JSON request
body is rejected by axum itself before any handler runs — plain-text
`400`, not the JSON error envelope either. Don't assume every non-2xx
response is JSON-parseable as the error shape above.

### Public — no auth, or auth is the body itself

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/tokens` | secret in body | Mint a client token. `{tenant_id, secret, sub, ttl_secs?}` → `{token, expires_in}`. Server-to-server only. |
| POST | `/api/v1/portal/auth/signup` | none | Self-serve: create a brand-new tenant + primary key pair + login account from `{email, password}`. `201`, returns `{access_token, token_type, expires_in, keys: {tenant_id, secret_key}}`. |
| POST | `/api/v1/portal/auth/register` | tenant secret in body | Create a portal login for a tenant an admin already provisioned, proving ownership via its real secret. `201`, logs in. |
| POST | `/api/v1/portal/auth/login` | none | Email/password login → portal session token. |
| GET | `/api/v1/system/health` | none | Liveness probe, plain text `"ok"`. |
| GET | `/api/v1/system/metrics` | none | Prometheus text exposition. |

### Client-token-authenticated (`Authorization: Bearer <client token>`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/messages` | HTTP publish, no persistent connection needed. `{tenant_id, channel_id, payload}` → `{published: true}`. No chunking — 211-byte cap. |
| POST | `/api/v1/push/subscriptions` | Register a Web Push subscription: `{tenant_id, endpoint, keys: {p256dh, auth}, channels: [...]}`. |
| DELETE | `/api/v1/push/subscriptions` | Unregister by `endpoint`. |

### Portal-session-authenticated (`Authorization: Bearer <portal session token>`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/portal/sessions` | Live WS/TCP connections for this tenant ("devices"). |
| POST | `/api/v1/portal/tokens` | Mint a client token from an already-authenticated portal session (no secret needed in the request). |
| GET | `/api/v1/portal/overview` | Active session count + aggregated tenant metrics. |
| GET | `/api/v1/portal/keys` | This tenant's primary `{tenant_id, secret_key}`. |
| POST | `/api/v1/portal/keys/rotate` | Rotate the primary secret in place. Returns the new secret once. |
| GET | `/api/v1/portal/api-keys` | List extra key pairs (never includes secrets — see below). |
| POST | `/api/v1/portal/api-keys` | Generate an extra key pair. `{name}` → `201` with `{id, name, public_key, secret, created_at}` — **the only response that ever includes `secret` for an extra pair; shown once.** |
| DELETE | `/api/v1/portal/api-keys/:id` | Revoke one extra key pair (404 if unknown/not owned). |
| GET | `/api/v1/portal/channels` | Live channels + subscriber counts for this tenant. |
| POST | `/api/v1/portal/broadcast` | Publish directly from the portal (no client token). |
| GET/POST | `/api/v1/portal/templates` | List / create saved message templates. |
| PUT/DELETE | `/api/v1/portal/templates/:id` | Update / delete a template. |
| GET/PUT | `/api/v1/portal/profile` | Read / partially update workspace profile. |
| PUT | `/api/v1/portal/profile/logo` | Upload logo, base64 data URI, ≤2 MB decoded. |
| PUT | `/api/v1/portal/account/password` | Change password (current + new, new ≥8 chars). |

### Admin-token-authenticated (`Authorization: Bearer <ADMIN_API_TOKEN>`, port `:9090` only)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/admin/tenants` | Provision a tenant, `201` with the secret in clear (once). |
| DELETE | `/api/v1/admin/tenants/:id` | Revoke a tenant. `204`. |
| PUT | `/api/v1/admin/tenants/:id/secret` | Rotate a tenant's secret (admin-initiated). New secret in clear once. |
| PUT | `/api/v1/admin/tenants/:id/limits` | Set rate-limit config. `204`. |
| GET | `/api/v1/admin/tenants/:id/sessions` | Live sessions for any tenant by id. |
| POST | `/api/v1/admin/tenants/:id/tokens` | Mint a token for an arbitrary tenant (backend provisioning flows). |

## 5. Error codes — every known `error.code` value

| Code | HTTP | Where |
|---|---|---|
| `INVALID_TENANT_SECRET` | 401 | `POST /api/v1/auth/tokens`, portal `register` |
| `EMAIL_ALREADY_REGISTERED` | 409 | portal `signup` |
| `INVALID_CREDENTIALS` | 401 | portal `login` |
| `KEY_PAIR_NOT_FOUND` | 404 | `GET /api/v1/portal/keys` before first rotate |
| `API_KEY_NOT_FOUND` | 404 | `DELETE /api/v1/portal/api-keys/:id`, unknown/not-owned |
| `API_KEY_NAME_REQUIRED` | 400 | `POST /api/v1/portal/api-keys`, blank name |
| `TEMPLATE_NOT_FOUND` | 404 | template update/delete, unknown id |
| `CHANNEL_ID_TOO_LONG` | 400 | portal broadcast, >24 bytes |
| `PAYLOAD_TOO_LARGE` | 400 | portal broadcast, >211 bytes |
| `RATE_LIMITED` | 429 | portal broadcast or `POST /api/v1/messages`, quota exhausted |
| `INVALID_LOGO` | 400 | bad MIME type or >2 MB decoded |
| `WEAK_PASSWORD` | 400 | new password <8 chars |
| `STORAGE_ERROR` | 500 | underlying DB error, any portal/push route |
| `UNAUTHORIZED` | 401 | missing/invalid session or admin token; client token doesn't validate for the given `tenant_id` |
| `MISSING_TOKEN` | 401 | `Authorization` header absent/malformed on `/api/v1/messages` or push routes |
| `INVALID_REQUEST` | 400 | `POST /api/v1/messages` body fails validation (channel/payload size) |
| `UNKNOWN_TENANT` | 404 | admin mint-token for a `:id` that doesn't exist |

## 6. Wire protocol — 256-byte fixed frame

```
Offset   Length  Field
0..2     2       Magic + version (0xAA01, big-endian u16)
2..3     1       Opcode
3..19    16      Tenant ID (raw UUID bytes)
19..43   24      Channel ID (UTF-8, zero-padded)
43..254  211     Payload (UTF-8, zero-padded)
254..256 2       CRC16/CCITT-FALSE over bytes [0..254)
```

| Opcode | Value | Direction | Meaning |
|---|---|---|---|
| SUB | `0x01` | client→server | Subscribe to an exact channel or wildcard pattern |
| PUB | `0x02` | client→server | Publish to a channel |
| MSG | `0x03` | server→client | A delivered message |
| AUTH | `0x04` | client→server | Authenticate the connection with a token, sent first, always |
| PING | `0x05` | client→server | Heartbeat |
| PRESENCE | `0x06` | server→client | Presence event (protocol-level only — no SDK exposes a `presence()` method yet; do not claim this feature works end-to-end) |
| REPLAY | `0x07` | client→server | Request channel history since a Unix timestamp |
| UNICAST | `0x08` | client→server | Direct-to-user send (`channel_id` field repurposed as `userId`) |
| UNSUB | `0x09` | client→server | Unsubscribe — a real server-side stop, not just client-side silence |

Normative reference: `backend/src/entities/Frame.rs`. Every SDK is a
faithful transposition of this exact layout — do not invent additional
fields or a different byte order.

## 7. Advanced features (persistently-connected SDKs)

Available in TypeScript/Python/Rust/Android once connected. **Not**
available in the lightweight WordPress browser client
(`mio-client.js`/`mio-embed.js`, deliberately trimmed) or the stateless
REST endpoints.

- **Wildcard subscribe**: `client.subscribe('orders:*', handler)`.
- **Unicast**: `client.unicast('user-42', payload)` — direct to one
  connected user, 24-byte `userId` limit (shares the frame's channel field).
- **Replay**: `client.replay('orders:42', sinceUnixSeconds)` (`0` = all
  available). Delivered through the same `subscribe()` handler, not a
  separate callback. History depth is a **deployment** setting, not a
  client one: 50 messages in memory by default (lost on restart), or
  durable via Redis Streams (up to `HISTORY_STREAM_MAXLEN`, default
  1000, survives restarts) if the server has `REDIS_URL` set. The
  client-side call is identical either way.
- **Automatic chunking**: `publish()`/`unicast()` transparently split
  payloads >211 bytes across multiple frames and reassemble on receipt —
  nothing to configure, doesn't apply to REPLAY-based catch-up entries'
  own original size at publish time. Only `POST /api/v1/messages` lacks this.
- **Named events, socket.io-style (`client.channel()`) — TypeScript
  only, as of this writing.** Python/Rust/Android don't have this;
  their `subscribe()`/`publish()` are unaffected.
  ```typescript
  const orders = client.channel('orders:42')
  orders.on('order.created', (data) => console.log(data.orderId))
  orders.emit('order.created', { orderId: 123 })
  ```
  Not a protocol change: `.emit()` publishes a JSON string
  `{"event": "...", "data": ...}`; `.on()` filters `subscribe()` for
  that shape + matching event name, silently ignoring anything else on
  the channel. Server-side equivalent: PHP `Client::emitEvent($channelId, $event, $token, $data = null)`
  (`sdk-wordpress`/`sdk-laravel`) emits the same envelope — cross-SDK
  compatible with `channel().on()` with zero extra work either side.

## 8. Per-SDK quick reference

### TypeScript (`@mio/realtime-sdk`) — browser, Node.js, base for React/RN

```bash
npm install @mio/realtime-sdk
npm install ws   # Node.js only, pre-v22 (no global WebSocket)
```
```typescript
import { createRealtimeClient } from '@mio/realtime-sdk'

const client = createRealtimeClient({
  host: 'realtime.example.com', secure: true,
  tenantId: '<tenant-id>', token: myTokenFromMintToken,
})
const unsubscribe = client.subscribe('orders:42', (message) => {
  console.log(message.channelId, message.payload)
})
client.connect()
client.publish('orders:42', 'order created')
```
No AUTH ack (see §1.6) — watch `close`, not just `authenticated`.

### React (`@mio/realtime-sdk-react`)

```bash
npm install @mio/realtime-sdk-react @mio/realtime-sdk
```
```jsx
import { RealtimeProvider, useChannel } from '@mio/realtime-sdk-react'

function App() {
  return (
    <RealtimeProvider config={{ host: 'realtime.example.com', secure: true, tenantId: '<tenant-id>', token }}>
      <OrdersFeed />
    </RealtimeProvider>
  )
}
function OrdersFeed() {
  const { messages, publish } = useChannel('orders:42', { limit: 100 })
  return <button onClick={() => publish('order created')}>Publish</button>
}
```
Also: `useSubscription`, `useConnectionState`, `useBackgroundNotifications`, `usePushSubscription`.

### React Native (`@mio/realtime-sdk-react-native`)

Same hooks as React, plus AppState-aware reconnection. **Notification
hooks are NOT re-exported** (browser-only `Notification`/`PushManager`
APIs don't exist in RN — use `@react-native-firebase/messaging` instead).

### Python (`realtime-sdk`, asyncio)

```bash
pip install realtime-sdk
```
```python
import asyncio
from uuid import UUID
from realtime_sdk import ClientConfig, RealtimeClient

async def main():
    config = ClientConfig(url="wss://realtime.example.com/ws", tenant_id=UUID("<tenant-id>"), token=token)
    async with RealtimeClient(config) as client:
        client.subscribe("orders:42", lambda msg: print(msg.payload))
        await client.publish("orders:42", "order created")
        await asyncio.sleep(3600)

asyncio.run(main())
```
**Caveat: `client.py` is documented as not yet runtime-tested by its
authors** — only the pure-stdlib protocol codec has real coverage.
Verify against a live connection before trusting generated code here.

### Rust (`realtime-sdk`, Tokio)

```rust
use realtime_sdk::{ClientConfig, RealtimeClient};
use uuid::Uuid;

#[tokio::main]
async fn main() {
    let client = RealtimeClient::connect(ClientConfig {
        url: "wss://realtime.example.com/ws".to_string(),
        tenant_id: Uuid::parse_str("<tenant-id>").unwrap(),
        token, ..Default::default()
    });
    let mut rx = client.subscribe("orders:42");
    tokio::spawn(async move {
        while let Ok(message) = rx.recv().await { println!("{}", message.payload); }
    });
    client.publish("orders:42", "order created").unwrap();
}
```
**Caveat: documented as not yet compiled by its authors.** Treat as a
first draft; run `cargo build` yourself before trusting it.

### Android — Kotlin/Java (Gradle module, OkHttp)

```kotlin
val client = RealtimeClient(RealtimeClientConfig(url = "wss://realtime.example.com/ws", tenantId = UUID.fromString("<tenant-id>"), token = token))
client.subscribe("orders:42") { message -> println(message.payload) }
client.connect()
client.publish("orders:42", "order created")
```
**Caveat: documented as not yet compiled by its authors** (no
`kotlinc`/JDK available when written). Callbacks fire on OkHttp's own
thread — dispatch to the UI thread yourself. No Maven artifact yet.

### WordPress (PHP `Mio\Realtime\Client`, no persistent connection)

```bash
composer require mio/realtime-wordpress
```
```php
use Mio\Realtime\Client;
$client = new Client('https://realtime.example.com:8090', '<tenant-id>', $secret);
$minted = $client->mintToken('user-42'); // MintedToken { token, expiresIn }
$client->publish('orders:42', 'order created', $minted->token);
$client->emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);
```
No chunking on `publish()`/`emitEvent()` — 211-byte cap, throws before
any network call if exceeded. Never let `$secret` leave PHP. Also
ships `[mio_realtime channel="..."]` shortcode and standalone
`mio-embed.js`/`mio-protocol.js`/`mio-client.js` (dependency-free
`<script>` tags, no PHP/build step — hosted via jsDelivr:
`https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.1/sdk-wordpress/assets/js/mio-embed.min.js`,
pin the tag, never `@master`).

### Laravel (`mio/realtime-laravel`)

Same `Client` class as WordPress, `LaravelHttpTransport` in place of
`wp_remote_post`.
```bash
composer require mio/realtime-laravel
php artisan vendor:publish --tag=mio-realtime-config
```
```php
use Mio\Realtime\Laravel\Facades\MioRealtime;
$minted = MioRealtime::mintToken('user-42');
MioRealtime::publish('orders:42', 'order created', $minted->token);
MioRealtime::emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);
```
Or inject `Mio\Realtime\Client` directly — same bound singleton.
**Caveat: service provider/facade not verified against a real booted
Laravel app**; only `LaravelHttpTransport` has real tests.

## 9. Web Push

```typescript
// Background (tab open, hidden) — no server setup:
import { attachBackgroundNotifications, requestNotificationPermission } from '@mio/realtime-sdk'
await requestNotificationPermission() // must be a user gesture, never on load
attachBackgroundNotifications(client, { title: (m) => `#${m.channelId}` })

// Closed tab/browser — needs a Service Worker + VAPID:
import { registerPushServiceWorker, subscribeToPush } from '@mio/realtime-sdk'
const registration = await registerPushServiceWorker('/sw.js')
const subscription = await subscribeToPush(registration, vapidPublicKey)
await fetch(`${apiUrl}/api/v1/push/subscriptions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ tenant_id, endpoint: subscription.endpoint, keys: subscription.keys, channels: ['orders:*'] }),
})
```
Delivery to a fully-quit browser still depends on the OS/browser waking
it — outside any SDK's or server's control.

## 10. Compile/test status per component (don't overclaim reliability)

| Component | Status |
|---|---|
| `backend/` | Compiled, tested (87/89 passing, 2 ignored live-Redis integration tests), deployed to production |
| `sdk-typescript` | Compiled + tested (30/30), includes `channel()` |
| `sdk-react` / `sdk-react-native` | Compiled (`tsc` strict), hooks not runtime-tested against a live server |
| `sdk-wordpress` | PHP `Client` tested (12/12 PHPUnit); JS codec/client tested (23/23); WordPress integration itself (routes, shortcode, settings page) untested against a real WordPress install |
| `sdk-laravel` | `LaravelHttpTransport` tested (3/3); service provider/facade untested against a real app |
| `sdk-python` | Protocol codec tested (13/13); `client.py` (network) untested |
| `sdk-rust` | Written, not compiled by its authors |
| `sdk-android` | Written, not compiled by its authors |

When generating code for the last three rows, say so explicitly rather
than presenting it as verified — these are honest first drafts, not
validated artifacts.
