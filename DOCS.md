# mio — SDK & API Docs

Markdown mirror of the in-app Docs page (`tenant-portal` → **Docs**, also
reachable unauthenticated at `/docs`) — same content, same structure,
same per-SDK caveats. The in-app version fills snippets in with *your*
real tenant ID and API host; this file uses placeholders since it's
static and shared across every tenant. Swap `<your-tenant-id>` and
`realtime.example.com` for your own (Overview → API Keys in the portal
has both).

## Getting started

Every SDK needs two things:

- **Your tenant ID** — public, safe to embed. Find it at Overview or API
  Keys in your tenant portal.
- **A client token** — signed server-side, scoped to one user (the
  `sub`). Mint one from Overview or API Keys in the portal — never
  generate one yourself, and never ship your tenant secret to a
  browser/mobile app.

```text
Portal API URL (REST):   https://realtime.example.com:8090
```

You do **not** configure a WebSocket URL yourself — every SDK receives it
from the server, as `ws_url` on the mint-token response below, and
connects to exactly that. This is deliberate: in production the WS
endpoint shares your API's domain with no port (`wss://realtime.example.com/ws`,
behind the same reverse proxy as the REST API), which is not guessable
from a `host`/`port` pair an SDK would otherwise have to be given.

## REST API

### Mint a token

Call this from your own backend only — your tenant secret never leaves
it. The resulting token is what you hand to an end user's SDK/browser/app.
`secret` accepts your tenant's primary secret (Settings → API keys) **or**
any additional, independently-revocable key pair's secret generated at
API Keys in your tenant portal — either works identically here; generating
extra pairs is purely so you can hand a different one to each
server/app/environment and revoke just that one later.

```http
POST https://realtime.example.com:8090/api/v1/auth/tokens
Content-Type: application/json

{ "tenant_id": "<your-tenant-id>", "secret": "<your-tenant-secret>", "sub": "user-42", "ttl_secs": 3600 }
```

```json
{ "success": true, "data": { "token": "…", "expires_in": 3600, "ws_url": "wss://realtime.example.com/ws" }, "trace_id": "…" }
```

`ws_url` is the exact address to connect to — the server derives it from
this request's own domain (or an operator-configured override), never
from anything the SDK supplies. Pass it straight into the SDK's config
below. Full request/derivation/response sequence:
[`diagrams/auth/issue-client-token/version.md`](diagrams/auth/issue-client-token/version.md).

> **`ttl_secs` defaults to 3600 (1 hour) and is capped at 2,592,000 (30
> days)** — a caller-supplied value beyond that is silently clamped to the
> cap rather than rejected. Once a token expires, there's no automated
> renewal: the client's connection closes and it has to be minted again
> and handed to the app fresh (see the `authFailed` event under each
> connected SDK's own section). For a backend that mints per-request or
> per-session, the 1-hour default is usually right; for a token
> hand-pasted into a static site with no backend of its own, mint a
> longer-lived one instead — tenant-portal's "Mint token" has presets up
> to the 30-day cap.

### Publish over HTTP

For a backend with no persistent connection open — a cron job, a webhook
handler. Authenticated with a token already minted above, never the raw
secret.

```http
POST https://realtime.example.com:8090/api/v1/messages
Content-Type: application/json
Authorization: Bearer <token from /api/v1/auth/tokens>

{ "tenant_id": "<your-tenant-id>", "channel_id": "orders:42", "payload": "order created" }
```

```json
{ "success": true, "data": { "published": true }, "trace_id": "…" }
```

> **Caveat:** no chunking on this endpoint — unlike a connected SDK
> client, payload must fit in 211 UTF-8 bytes (one protocol frame) or it
> returns `400 INVALID_REQUEST`. Split larger messages into multiple
> calls, or use a connected SDK client instead.

### Publish a saved template over HTTP

Sends one of the tenant's templates (tenant-portal → Templates) by id
instead of a raw `payload` — the `{{variable}}` placeholders are filled in
**server-side**, so the caller never needs the template's own text or the
tenant's full template list, only the `template_id` and the values to
fill in. Same bearer client token as `/api/v1/messages`, never the raw
secret.

```http
POST https://realtime.example.com:8090/api/v1/messages/template
Content-Type: application/json
Authorization: Bearer <token from /api/v1/auth/tokens>

{
  "tenant_id": "<your-tenant-id>",
  "channel_id": "orders:42",
  "template_id": "<template id from tenant-portal>",
  "variables": { "name": "Ada", "order_id": "42" }
}
```

```json
{ "success": true, "data": { "published": true }, "trace_id": "…" }
```

Every connected SDK exposes this as `publishTemplate(channelId, templateId, variables)`
alongside its existing `publish(channelId, payload)`.

> **Caveats:** same 211-byte limit as above, checked *after* interpolation
> (`400 INVALID_REQUEST` if the rendered text doesn't fit — shorten the
> template or the values). A `template_id` that doesn't exist, or belongs
> to a different tenant, returns `404 TEMPLATE_NOT_FOUND`. A variable with
> no matching entry in `variables` renders as an empty string rather than
> leaving the `{{placeholder}}` in the sent text.

## Web Push

### Background notifications (tab open, hidden)

Works today, no server setup needed — shows a native `Notification`
whenever a message arrives while the tab is hidden or unfocused.

```bash
npm install @mio/realtime-sdk
```

```typescript
import { attachBackgroundNotifications, requestNotificationPermission } from '@mio/realtime-sdk'

// On a user gesture (a click) — never auto-request on load:
await requestNotificationPermission()

attachBackgroundNotifications(client, {
  title: (m) => `#${m.channelId}`,
})
```

For per-channel control instead of every subscribed channel at once, call
`showBackgroundNotification(message, options)` directly from a
`subscribe()` callback — same `options`, same gating (permission granted,
tab hidden/unfocused) — rather than `attachBackgroundNotifications`'s
client-wide `"message"` event:

```typescript
import { showBackgroundNotification } from '@mio/realtime-sdk'

client.subscribe('orders:42', (message) => {
  showBackgroundNotification(message, { title: () => 'New order' })
})
```

Also available with zero build step in the WordPress lightweight client
(no `npm install`) — `MioRealtimeClient.showBackgroundNotification(message, options)`,
`.attachBackgroundNotifications(client, options)`, and
`.requestNotificationPermission()`, same options shape, on both
`mio-client.js` and `mio-embed.js`. See the WordPress section below and
`sdk-wordpress/README.md`'s "Notifications en arrière-plan".

### Push notifications (tab or browser closed)

Needs a Service Worker in your app (registered for you) and a backend
that sends real encrypted Web Push (VAPID) to the subscription this call
registers — see this platform's `push_subscriptions` endpoint.

```typescript
import { registerWebPushSubscription } from '@mio/realtime-sdk'

const { subscription } = await registerWebPushSubscription({
  apiBaseUrl: 'https://realtime.example.com:8090',
  token,          // minted server-side, never your tenant secret
  tenantId: '<your-tenant-id>',
  vapidPublicKey,
  channels: ['orders:*'], // defaults to ['*'] (every channel)
})
// subscription: { endpoint, keys: { p256dh, auth } }
```

One call: requests permission, registers your Service Worker, subscribes,
then registers with the server. Want to assemble those steps yourself
instead (e.g. to POST to your own backend rather than mio directly)? Use
`registerPushServiceWorker`/`subscribeToPush` directly — the same pieces
`registerWebPushSubscription` is built from. Symmetric teardown:
`unregisterWebPushSubscription({ apiBaseUrl, token, tenantId })`.

> **Caveat:** delivery to a fully-quit browser (not just a closed tab)
> still depends on the OS/browser waking it for the push — outside any
> SDK's or server's control.

No plugin, no build step? `mio-vapid-subscription.js` is the same flow as
a single dependency-free `<script>` tag — see "Embed script" below.

## Advanced features (connected SDKs)

Available identically in every persistently-connected SDK — TypeScript,
Python, Rust, Android — once `client` is constructed as shown in each
SDK's own section below. Not available in the lightweight WordPress
browser client (`mio-client.js`/`mio-embed.js` — deliberately trimmed,
see their own header comments) or the stateless REST endpoints.

### Wildcard subscribe

Subscribe to a whole family of channels with a trailing `*` — every
matching `channelId` routes to the same handler.

```typescript
client.subscribe('orders:*', (message) => console.log(message.channelId, message.payload))
```

### Unicast — direct to one user

Sends to one connected user instead of a channel's subscribers.
`userId` reuses the frame's `channelId` field, so it inherits the same
24-byte limit.

```typescript
client.unicast('user-42', 'you have a new order')
```

### Replay — catch up on channel history

Requests everything published to a channel since `sinceUnixSeconds`
(`0` = all available history). Replayed messages arrive through the
same `subscribe()` handler already registered for that channel — no
separate callback to wire up.

```typescript
client.subscribe('orders:42', (message) => console.log(message.payload))
client.replay('orders:42', 0)
```

> **Caveat:** not supported on a wildcard pattern (`orders:*`) — the
> server silently ignores a REPLAY request for anything but an exact
> channel ID.

**How much history is actually available is a deployment detail, not a
client-side setting.** By default (no `REDIS_URL` set on the server)
each channel keeps only its most recent 50 messages, in memory — gone on
a restart. Set `REDIS_URL` (the same variable that enables multi-instance
broadcast) and the server durably persists history to a per-channel
Redis Stream instead, capped at `HISTORY_STREAM_MAXLEN` (default 1000)
and surviving restarts — `replay()` on the client needs no changes
either way, it's the exact same call. See `backend/docker-compose.shared-proxy.yml`'s
`service-cache` for the deployment side of this.

### Automatic chunking — TypeScript only

**Correction (this used to say all four connected SDKs behave the
same — verified against the actual source and that was wrong):** only
`sdk-typescript`'s `publish()`/`unicast()` transparently split a
payload larger than one 211-byte frame into multiple frames and
reassemble them before `subscribe()` fires — nothing to configure.

Python/Rust/Android have no chunking module at all (confirmed: no
`chunking.py`/`chunking.rs`/`Chunking.kt` anywhere in those SDKs) —
their `publish()`/`unicast()` **silently truncate** any payload over
211 UTF-8 bytes at encode time (on a valid UTF-8 character boundary,
so it never panics, but the tail of the message is simply gone — no
exception, no error return, no signal to the caller at all). This is a
real footgun: check your payload size yourself before calling
`publish()`/`unicast()` in those three SDKs, or split it into multiple
calls. The stateless REST publish endpoint (`POST /api/v1/messages`)
takes the opposite, safer approach: it rejects an oversized payload
with `400 INVALID_REQUEST` before any network call, same as PHP's
`Client::publish()`/`emitEvent()` (`ClientException`, also before any
network call) — neither of those silently truncates.

`unicast()`/`replay()` themselves (the methods, not chunking) do exist
identically in every connected SDK: Python — `await client.unicast(...)`
/ `await client.replay(...)`; Rust — `client.unicast(...)` /
`client.replay(...)`; Android (Kotlin/Java) — `client.unicast(...)` /
`client.replay(...)`.

### Named events, socket.io-style — `client.channel()`

**TypeScript only for now** (Python/Rust/Android don't have this yet —
their `subscribe()`/`publish()` work unchanged in the meantime). A
channel-scoped handle with `.on(event, handler)`/`.emit(event, data)`,
for a channel that carries more than one type of message:

```typescript
const orders = client.channel('orders:42')
orders.on('order.created', (data) => console.log(data.orderId))
orders.emit('order.created', { orderId: 123 })
```

Not a protocol change — `.emit()` is a `publish()` whose payload encodes
`{"event": ..., "data": ...}` in JSON; `.on()` filters `subscribe()` for
messages matching that shape and event name, ignoring anything else on
the channel (a plain-string `publish()`, or an event with a different
name) rather than erroring on it. See the WordPress/Laravel section
below for `Client::emitEvent()` — same envelope, server-side.

## JavaScript / TypeScript

Browser, Node.js, and the base for the React/React Native bindings.

```bash
npm install @mio/realtime-sdk
# Node.js only (pre-v22): WebSocket isn't global — the SDK loads this itself, no import needed
npm install ws
```

```typescript
import { createRealtimeClient } from '@mio/realtime-sdk'

// wsUrl comes from the mint-token response above (data.ws_url) — never
// assembled from a host/port/secure config, see "Getting started".
const client = createRealtimeClient({
  wsUrl: wsUrlFromMintToken,
  tenantId: '<your-tenant-id>',
  token: myTokenFromMintToken,
})

const unsubscribe = client.subscribe('orders:42', (message) => {
  console.log(message.channelId, message.payload)
})

client.connect()
client.publish('orders:42', 'order created')

// later:
unsubscribe()
client.disconnect()
```

> **Caveat:** no AUTH acknowledgement in the protocol — the
> `authenticated` event fires optimistically right after sending; watch
> the `authFailed` event to detect an auth failure instead (an invalid or
> expired token). The server sends a dedicated WS close code (`4001`) for
> exactly this, so the SDK never confuses it with a network drop or a
> server restart — and without `getToken` configured (below), never keeps
> retrying with the same now-invalid token, even with `reconnect: true`.

```typescript
client.on('authFailed', ({ code, reason }) => {
  // e.g. show "session expired", mint a fresh token server-side, then
  // reconnect with a brand-new RealtimeClient once you have it.
})
```

### Silent token renewal — `getToken`

If your app has its own backend that can mint a token on demand (calling
`POST /api/v1/auth/tokens` itself, with the tenant secret — **never this
SDK, never the browser**), replace `token` with `getToken` and renewal
happens automatically:

```typescript
const client = createRealtimeClient({
  wsUrl: 'wss://realtime.example.com/ws', // fallback — a wsUrl returned by getToken() below takes over
  tenantId: '<your-tenant-id>',
  getToken: async () => {
    const res = await fetch('/api/realtime-token', { method: 'POST' })
    const { token, wsUrl } = await res.json()
    return { token, wsUrl } // wsUrl optional — omit it to reuse the one already configured
  },
})
```

`getToken()` is called before *every* connection attempt — the first
`connect()`, and automatically on every reconnect, including right after
an `authFailed`. A rejected `getToken()` is treated like any other
connection failure: `error` is emitted and a reconnect is scheduled with
the same exponential backoff as everything else, never a tight retry
loop against a temporarily-down backend. `token` and `getToken` are
mutually exclusive — the config type enforces exactly one at compile time.

## React

Context + hooks over the TypeScript SDK — no manual
useEffect/subscribe/unsubscribe boilerplate.

```bash
npm install @mio/realtime-sdk-react @mio/realtime-sdk
```

```jsx
import { RealtimeProvider, useChannel } from '@mio/realtime-sdk-react'

function App() {
  return (
    <RealtimeProvider
      config={{ wsUrl: wsUrlFromMintToken, tenantId: '<your-tenant-id>', token: myTokenFromMintToken }}
    >
      <OrdersFeed />
    </RealtimeProvider>
  )
}

function OrdersFeed() {
  const { messages, publish } = useChannel('orders:42', { limit: 100 })
  return (
    <>
      <ul>{messages.map((m, i) => <li key={i}>{m.payload}</li>)}</ul>
      <button onClick={() => publish('order created')}>Publish</button>
    </>
  )
}
```

Also available: `useSubscription` (effect-only, no re-render),
`useConnectionState`, `useBackgroundNotifications`, `usePushSubscription`.

## React Native

Re-exports the React SDK's hooks/components as-is (none touch the DOM)
and adds AppState-aware reconnection — necessary because a backgrounded
RN app can be fully suspended by the OS, unlike a browser tab.

```bash
npm install @mio/realtime-sdk-react-native @mio/realtime-sdk
```

```jsx
import { RealtimeProvider, useChannel } from '@mio/realtime-sdk-react-native'

function App() {
  return (
    <RealtimeProvider
      config={{ wsUrl: wsUrlFromMintToken, tenantId: '<your-tenant-id>', token: myTokenFromMintToken }}
    >
      <OrdersFeed />
    </RealtimeProvider>
  )
}

function OrdersFeed() {
  const { messages, publish } = useChannel('orders:42', { limit: 100 })
  // ... same API as @mio/realtime-sdk-react
}
```

> **Caveat:** notification hooks (`useBackgroundNotifications`/
> `usePushSubscription`) are deliberately NOT re-exported here — they
> wrap browser-only `Notification`/`PushManager` APIs that don't exist in
> React Native. Native push needs a different mechanism (e.g.
> `@react-native-firebase/messaging`).

## Python

asyncio-based client.

```bash
pip install realtime-sdk  # or `pip install -e .` from sdk-python/ in this repo
```

```python
import asyncio
from uuid import UUID
from realtime_sdk import ClientConfig, RealtimeClient

async def main():
    config = ClientConfig(
        url="wss://realtime.example.com/ws",
        tenant_id=UUID("<your-tenant-id>"),
        token=my_token_from_mint_token,
    )
    async with RealtimeClient(config) as client:
        client.subscribe("orders:42", lambda msg: print(msg.payload))
        await client.publish("orders:42", "order created")
        await asyncio.sleep(3600)

asyncio.run(main())
```

> **Caveat:** the WebSocket client (`client.py`) is documented as not yet
> runtime-tested by its authors — only the pure-stdlib protocol codec has
> real test coverage. Verify against a live connection before production use.

## Rust

Tokio-based client.

```toml
# Cargo.toml
[dependencies]
realtime-sdk = { path = "../sdk-rust" } # or git/crates.io once published
tokio = { version = "1", features = ["full"] }
```

```rust
use realtime_sdk::{ClientConfig, RealtimeClient};
use uuid::Uuid;

#[tokio::main]
async fn main() {
    let client = RealtimeClient::connect(ClientConfig {
        url: "wss://realtime.example.com/ws".to_string(),
        tenant_id: Uuid::parse_str("<your-tenant-id>").unwrap(),
        token: my_token_from_mint_token,
        ..Default::default()
    });

    let mut rx = client.subscribe("orders:42");
    tokio::spawn(async move {
        while let Ok(message) = rx.recv().await {
            println!("{}: {}", message.channel_id, message.payload);
        }
    });

    client.publish("orders:42", "order created").unwrap();
}
```

> **Caveat:** this SDK is documented as not yet compiled by its authors
> (no Rust toolchain was available when it was written) — run
> `cargo build` yourself and treat it as a first draft, not a validated
> artifact.

## Android

### Kotlin

Gradle library module, OkHttp-based. No Maven artifact published yet —
integrate as a local module.

```kotlin
val client = RealtimeClient(
    RealtimeClientConfig(
        url = "wss://realtime.example.com/ws",
        tenantId = UUID.fromString("<your-tenant-id>"),
        token = myTokenFromMintToken,
    )
)

val subscription = client.subscribe("orders:42") { message ->
    println(message.payload)
}

client.connect()
client.publish("orders:42", "order created")

// later:
subscription.close()
client.disconnect()
```

> **Caveat:** not yet compiled by its authors (no `kotlinc`/full JDK
> available when written) — run `./gradlew build test` yourself.
> Callbacks fire on OkHttp's own thread, not the Android main thread —
> dispatch to the UI thread yourself.

Watch `ConnectionEvent.AuthFailed` to detect an invalid/expired token
(same dedicated WS close code as the other SDKs, `4001`) — without a
`tokenProvider` (below), the client never auto-reconnects after this,
even with `reconnect = true`. For silent renewal, replace `token` with
`tokenProvider`, called synchronously on the client's own background
thread (safe to block on your backend's HTTP call there) before every
connection attempt, including automatically after an `AuthFailed`:

```kotlin
val config = RealtimeClientConfig(
    url = "wss://realtime.example.com/ws", // fallback — a wsUrl from tokenProvider takes over
    tenantId = UUID.fromString("<your-tenant-id>"),
    tokenProvider = TokenProvider {
        val minted = myBackend.mintRealtimeToken() // your own backend call, not mio's API directly
        TokenRefreshResult(token = minted.token, wsUrl = minted.wsUrl)
    },
)
```

### Java

Same client, Java-friendly surface (SAM interfaces, `@JvmOverloads`).

```java
RealtimeClientConfig config = new RealtimeClientConfig(
    "wss://realtime.example.com/ws",
    UUID.fromString("<your-tenant-id>"),
    myTokenFromMintToken
);
RealtimeClient client = new RealtimeClient(config);

AutoCloseable subscription = client.subscribe("orders:42",
    message -> System.out.println(message.getPayload()));

client.connect();
client.publish("orders:42", "order created");
```

Same `ConnectionEvent.AuthFailed`/`tokenProvider` story as Kotlin above —
Java has no named/optional arguments, so pass `null` for `token` and fill
in every parameter through `tokenProvider` explicitly:

```java
TokenProvider tokenProvider = () -> {
    MintedToken minted = myBackend.mintRealtimeToken(); // your own backend call
    return new TokenRefreshResult(minted.getToken(), minted.getWsUrl());
};
RealtimeClientConfig config = new RealtimeClientConfig(
    "wss://realtime.example.com/ws", // fallback — a wsUrl from tokenProvider takes over
    UUID.fromString("<your-tenant-id>"),
    null, // token
    tokenProvider,
    15_000L, true, 500L, 15_000L, new OkHttpClient() // defaults, spelled out
);
```

## WordPress

### Server side (PHP)

Mint tokens and publish from PHP hooks (`save_post`, a cron job, ...).
Configure **Settings → mio Realtime** in your WP admin with your tenant
ID and secret first.

```bash
composer require mio/realtime-wordpress  # or copy sdk-wordpress/ into wp-content/plugins/
```

```php
use Mio\Realtime\Client;

$client = new Client('https://realtime.example.com:8090', '<your-tenant-id>', $secret);

$minted = $client->mintToken('user-42'); // -> MintedToken { token, expiresIn, wsUrl }
$client->publish('orders:42', 'order created', $minted->token);
```

> **Caveat:** `Client::publish()` does not chunk — payload over 211
> UTF-8 bytes throws before any network call. Never return `$secret` to
> the browser — only `$minted->token` should leave PHP.

`Client::emitEvent()` is `publish()` for a named event with
JSON-serializable data — same envelope `sdk-typescript`'s
`client.channel(id).on(event, handler)` decodes, so a browser client
receives exactly this, cross-SDK, no server-side protocol change:

```php
$client->emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);
// Received in the browser as:
// client.channel('orders:42').on('order.created', (data) => ...) // data.orderId === 123
```

### On the page

A shortcode renders a live-updating feed, backed by a real WebSocket
connection in the visitor's browser.

```text
[mio_realtime channel="orders:42" limit="20" replay="true"]
```

Functional starting point, not a themed component — style
`.mio-realtime-feed` yourself.

## Laravel

Same framework-independent `Mio\Realtime\Client` PHP class the
WordPress plugin uses above — it calls zero WordPress functions itself
(see `sdk-wordpress/includes/HttpTransport.php`'s own doc comment) —
wired into Laravel's service container instead: a service provider, a
facade, and Laravel's own HTTP client in place of `wp_remote_post`.

```bash
composer require mio/realtime-laravel
php artisan vendor:publish --tag=mio-realtime-config
```

```env
MIO_REALTIME_API_URL=https://realtime.example.com:8090
MIO_REALTIME_TENANT_ID=<your-tenant-id>
MIO_REALTIME_SECRET=<your-tenant-secret>
```

```php
use Mio\Realtime\Laravel\Facades\MioRealtime;

$minted = MioRealtime::mintToken('user-42'); // -> MintedToken { token, expiresIn }
MioRealtime::publish('orders:42', 'order created', $minted->token);

// Named event, same envelope client.channel(id).on() decodes — see WordPress section above:
MioRealtime::emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);
```

Or resolve `Mio\Realtime\Client` directly via the container (constructor
injection, a form request, a job) instead of the facade — both reach
the same bound singleton. See `sdk-laravel/README.md` for why this
package depends on `mio/realtime-wordpress` (naming leftover, not a
functional coupling) and its honest test-coverage caveat.

> **Caveat:** same HTTP-only publish path as WordPress above — no
> persistent WebSocket connection, no chunking. `publish()` throws
> before any network call if `$payload` exceeds 211 UTF-8 bytes.

## Embed script — any website, no build step

Not WordPress-specific despite living in `sdk-wordpress/assets/js/` —
`mio-embed.js` is a single, dependency-free file for pasting into any
HTML page (a Custom HTML block, a theme's header/footer area, a static
site's `<head>`) — no PHP, no build step, no framework of any kind. See
`sdk-wordpress/README.md`'s "Sans installer l'extension" section for
the full usage and its honest token-exposure trade-off; the
`vanilla-client/` directory in this repo is a working local test
harness for it.

No hosting to set up — the repo is public, so [jsDelivr's GitHub
CDN](https://www.jsdelivr.com/documentation#id-github) serves the file
straight from a tagged release, globally cached. Use the `.min.js`
build — a committed, terser-minified artifact (`npm run build` in
`sdk-wordpress/`, see `sdk-wordpress/scripts/minify.js`), not the raw
source — the plain `.js` files stay in the repo purely for reading:

```html
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.10/sdk-wordpress/assets/js/mio-embed.min.js"
  data-ws-url="wss://realtime.example.com/ws"
  data-tenant-id="<your-tenant-id>"
  data-token="…"
  data-channel="orders:42"
  data-replay="true"
></script>
```

`data-ws-url` is the `ws_url` from the mint-token response — hand it
through as-is, never assemble it from a host/port.

> **Pin the version.** `@v0.1.10` above is a git tag — jsDelivr caches
> tagged refs aggressively (fast, and a future commit can never silently
> change what's already embedded on someone's site). Never use `@master`
> in a URL you hand to a third party: it's mutable, so a later change to
> this repo could break every site embedding it without warning. Cut a
> new tag and bump the URL (running `npm run build` first, so the tagged
> commit's `.min.js` files are current) when you want people to pick up a fix.

### `mio-vapid-subscription.js` — Web Push, no plugin, no build step

Same dependency-free, paste-it-in family as `mio-embed.js` above, but for
Web Push registration instead of a live feed. Every credential is a
property — either this `<script>` tag's own `data-*` attributes, or
passed to `window.MioVapidSubscription.subscribe()`/`.unsubscribe()`
directly:

```html
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.10/sdk-wordpress/assets/js/mio-vapid-subscription.min.js"
  data-api-base-url="https://realtime.example.com:8090"
  data-tenant-id="<your-tenant-id>"
  data-token="…"
  data-vapid-public-key="…"
  data-channels="orders:*"
  data-button="#enable-notifications"
></script>
<button id="enable-notifications">Enable notifications</button>
```

`data-channels` is comma-separated (defaults to `*`, every channel).
`data-sw-url` defaults to `/sw.js` (must already be deployed on your own
site — this file registers it, it doesn't create one for you).

> **Why this can't auto-run on page load, unlike `mio-embed.js`'s feed:**
> `Notification.requestPermission()` only works from inside a user
> gesture in effectively every browser. `data-button` wires that
> element's click for you; call `window.MioVapidSubscription.subscribe(options)`
> yourself if you'd rather trigger it from your own code. On
> success/failure it dispatches `mio:vapid-subscribed`/
> `mio:vapid-subscription-error` `CustomEvent`s on the button element —
> listen for those to show your own feedback.

Same version-pinning caveat as above — this file is minified and served
from the same CDN/tag.

### `mio-protocol.js` + `mio-client.js` — building your own page logic

For anything beyond the auto-rendered feed above — custom UI around
messages, multiple channels, your own publish form — load the two files
`mio-embed.js` bundles, and drive `MioRealtimeClient` yourself. Same
CDN, same tag, minified builds, loaded in dependency order:

```html
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.10/sdk-wordpress/assets/js/mio-protocol.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.10/sdk-wordpress/assets/js/mio-client.min.js"></script>
<script>
  var client = new window.MioRealtimeClient({
    wsUrl: 'wss://realtime.example.com/ws', // the ws_url from mint-token, never assembled by hand
    tenantId: '<your-tenant-id>',
    token: '…', // minted server-side, never your tenant secret
  })
  client.subscribe('orders:42', function (message) {
    console.log(message.channelId, message.payload)
  })
  client.connect()
  client.publish('orders:42', 'order created')
</script>
```

> **Not from this CDN:** `mio-shortcode.js`. It only makes sense wired up
> by the WordPress plugin itself — it expects DOM structure
> (`.mio-realtime-feed`) and a `mioRealtimeConfig.restTokenUrl` global
> that only `wp_localize_script` injects, so there's nothing a bare
> `<script>` tag on another site could do with it.

Add background notifications, same `client` as above — either per-channel,
directly inside a `subscribe()` callback:

```html
<script>
  document.getElementById('enable-notifs').addEventListener('click', function () {
    // On a user gesture (a click) — never auto-request on load:
    window.MioRealtimeClient.requestNotificationPermission()
  })

  client.subscribe('orders:42', function (message) {
    window.MioRealtimeClient.showBackgroundNotification(message, {
      title: function (m) { return '#' + m.channelId },
    })
  })
</script>
```

...or once for every subscribed channel, via `attachBackgroundNotifications`:

```html
<script>
  window.MioRealtimeClient.attachBackgroundNotifications(client, {
    title: function (m) { return '#' + m.channelId },
  })
</script>
```

Same calls on `window.MioEmbedClient` if you're using `mio-embed.js`
instead. See DOCS.md's "Background notifications" under Web Push above
for what this does and doesn't cover (tab hidden, not tab/browser closed).
