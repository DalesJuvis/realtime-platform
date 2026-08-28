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
WebSocket host (SDKs):   realtime.example.com (secure: true|false — matches your deployment)
Portal API URL (REST):   https://realtime.example.com:8090
```

## REST API

### Mint a token

Call this from your own backend only — your tenant secret never leaves
it. The resulting token is what you hand to an end user's SDK/browser/app.

```http
POST https://realtime.example.com:8090/api/v1/auth/tokens
Content-Type: application/json

{ "tenant_id": "<your-tenant-id>", "secret": "<your-tenant-secret>", "sub": "user-42", "ttl_secs": 3600 }
```

```json
{ "success": true, "data": { "token": "…", "expires_in": 3600 }, "trace_id": "…" }
```

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

### Push notifications (tab or browser closed)

Needs a Service Worker in your app and a backend that sends real
encrypted Web Push (VAPID) to the subscription below — see this
platform's `push_subscriptions` endpoint.

```typescript
import { registerPushServiceWorker, subscribeToPush } from '@mio/realtime-sdk'

const registration = await registerPushServiceWorker('/sw.js')
const subscription = await subscribeToPush(registration, vapidPublicKey)
// subscription: { endpoint, keys: { p256dh, auth } }

await fetch('https://realtime.example.com:8090/api/v1/push/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    tenant_id: '<your-tenant-id>',
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    channels: ['orders:*'],
  }),
})
```

> **Caveat:** delivery to a fully-quit browser (not just a closed tab)
> still depends on the OS/browser waking it for the push — outside any
> SDK's or server's control.

## JavaScript / TypeScript

Browser, Node.js, and the base for the React/React Native bindings.

```bash
npm install @mio/realtime-sdk
# Node.js only (pre-v22): WebSocket isn't global — the SDK loads this itself, no import needed
npm install ws
```

```typescript
import { createRealtimeClient } from '@mio/realtime-sdk'

const client = createRealtimeClient({
  host: 'realtime.example.com',
  secure: true,
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
> the `close` event to detect an auth failure instead.

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
      config={{ host: 'realtime.example.com', secure: true, tenantId: '<your-tenant-id>', token: myTokenFromMintToken }}
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
      config={{ host: 'realtime.example.com', secure: true, tenantId: '<your-tenant-id>', token: myTokenFromMintToken }}
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

$minted = $client->mintToken('user-42'); // -> MintedToken { token, expiresIn }
$client->publish('orders:42', 'order created', $minted->token);
```

> **Caveat:** `Client::publish()` does not chunk — payload over 211
> UTF-8 bytes throws before any network call. Never return `$secret` to
> the browser — only `$minted->token` should leave PHP.

### On the page

A shortcode renders a live-updating feed, backed by a real WebSocket
connection in the visitor's browser.

```text
[mio_realtime channel="orders:42" limit="20" replay="true"]
```

Functional starting point, not a themed component — style
`.mio-realtime-feed` yourself.

### No plugin at all — `mio-embed.js`

A single, dependency-free file for pasting directly into WordPress (a
Custom HTML block, a theme's header/footer area) — no PHP, no build
step. See `sdk-wordpress/README.md`'s "Sans installer l'extension"
section for the full usage and its honest token-exposure trade-off.

No hosting to set up — the repo is public, so [jsDelivr's GitHub
CDN](https://www.jsdelivr.com/documentation#id-github) serves the file
straight from a tagged release, globally cached. Use the `.min.js`
build — a committed, terser-minified artifact (`npm run build` in
`sdk-wordpress/`, see `sdk-wordpress/scripts/minify.js`), not the raw
source — the plain `.js` files stay in the repo purely for reading:

```html
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.1/sdk-wordpress/assets/js/mio-embed.min.js"
  data-host="realtime.example.com"
  data-tenant-id="<your-tenant-id>"
  data-token="…"
  data-channel="orders:42"
  data-replay="true"
></script>
```

> **Pin the version.** `@v0.1.1` above is a git tag — jsDelivr caches
> tagged refs aggressively (fast, and a future commit can never silently
> change what's already embedded on someone's site). Never use `@master`
> in a URL you hand to a third party: it's mutable, so a later change to
> this repo could break every site embedding it without warning. Cut a
> new tag and bump the URL (running `npm run build` first, so the tagged
> commit's `.min.js` files are current) when you want people to pick up a fix.

### `mio-protocol.js` + `mio-client.js` — building your own page logic

For anything beyond the auto-rendered feed above — custom UI around
messages, multiple channels, your own publish form — load the two files
`mio-embed.js` bundles, and drive `MioRealtimeClient` yourself. Same
CDN, same tag, minified builds, loaded in dependency order:

```html
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.1/sdk-wordpress/assets/js/mio-protocol.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.1/sdk-wordpress/assets/js/mio-client.min.js"></script>
<script>
  var client = new window.MioRealtimeClient({
    host: 'realtime.example.com',
    secure: true,
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
