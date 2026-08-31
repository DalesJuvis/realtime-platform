/**
 * # DocsPage
 *
 * In-app SDK/API reference — quick-start snippets for every SDK in this
 * platform's family (TypeScript, React, React Native, Python, Rust,
 * Android, WordPress), plus the raw REST API and Web Push. Snippets are
 * interpolated with this tenant's *real* tenant ID (`getKeysAction`, same
 * source `PublicKeyCard`/`MintTokenCard` already use) and the actual
 * configured API host (`deriveWsHost(env.defaultApiUrl)`) — copy-pasteable
 * against this workspace, not generic placeholders. The token itself is
 * never fabricated here: every snippet points at Overview/API Keys'
 * "Mint token" flow rather than inventing one.
 *
 * Content mirrors each SDK's own README exactly (including their honestly
 * documented "not yet verified" caveats — see `sdk-rust`/`sdk-android`'s
 * own status callouts) rather than a rewritten summary, so it can't drift
 * into claiming more than each SDK actually delivers.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BookOpen, KeyRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { CodeBlock } from '@components/shared/CodeBlock'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { env } from '@lib/env'
import { deriveWsHost } from '@lib/utils'
import type { CodeLanguage } from '@lib/prism'

function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function Section({
  title,
  description,
  install,
  installLabel = 'Install',
  installLanguage = 'bash',
  code,
  codeLabel = 'Quick start',
  language,
  caveat,
  children,
}: {
  title: string
  description: string
  install?: string
  installLabel?: string
  installLanguage?: CodeLanguage
  code: string
  codeLabel?: string
  language?: CodeLanguage
  caveat?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Card className="rounded-sm shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {install && <CodeBlock label={installLabel} code={install} language={installLanguage} />}
        <CodeBlock label={codeLabel} code={code} language={language} />
        {children}
        {caveat && <Caveat>{caveat}</Caveat>}
      </CardContent>
    </Card>
  )
}

export default function DocsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    getKeysAction()
      .then((keys) => setTenantId(keys.tenantId))
      .catch(() => setTenantId(null))
  }, [])

  const tid = tenantId ?? '<your-tenant-id>'
  const host = deriveWsHost(env.defaultApiUrl)
  const secure = (() => {
    try {
      return new URL(env.defaultApiUrl).protocol === 'https:'
    } catch {
      return false
    }
  })()
  const apiUrl = env.defaultApiUrl
  // Illustrative only — every SDK actually receives this as `ws_url` on
  // the mint-token response (server-derived, see LLMS.md §1 rule 8), it
  // is never assembled from a host/port/secure config by the SDK itself.
  const wsUrl = `${secure ? 'wss' : 'ws'}://${host}/ws`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          Docs
        </h1>
        <p className="text-sm text-muted-foreground">
          SDKs and API reference for this workspace — snippets below are filled in with your real tenant ID and API host.
        </p>
      </div>

      <Tabs defaultValue="getting-started" className="flex flex-col gap-6 lg:flex-row">
        <TabsList className="h-auto w-full shrink-0 flex-row flex-wrap justify-start gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:items-stretch">
          <TabsTrigger value="getting-started" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Getting started</TabsTrigger>
          <TabsTrigger value="rest-api" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">REST API</TabsTrigger>
          <TabsTrigger value="web-push" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Web Push</TabsTrigger>
          <TabsTrigger value="advanced" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Advanced features</TabsTrigger>
          <TabsTrigger value="typescript" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">JavaScript / TypeScript</TabsTrigger>
          <TabsTrigger value="react" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">React</TabsTrigger>
          <TabsTrigger value="react-native" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">React Native</TabsTrigger>
          <TabsTrigger value="python" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Python</TabsTrigger>
          <TabsTrigger value="rust" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Rust</TabsTrigger>
          <TabsTrigger value="android" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Android (Kotlin/Java)</TabsTrigger>
          <TabsTrigger value="wordpress" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">WordPress</TabsTrigger>
          <TabsTrigger value="laravel" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Laravel</TabsTrigger>
          <TabsTrigger value="embed" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Embed script (any site)</TabsTrigger>
        </TabsList>

        <div className="min-w-0 flex-1 space-y-6">
          <TabsContent value="getting-started" className="mt-0 space-y-4">
            <Card className="rounded-sm border-none bg-primary/5 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  Every SDK needs two things
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">Your tenant ID</strong> — public, safe to embed:{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{tid}</code>
                </p>
                <p>
                  <strong className="text-foreground">A client token</strong> — signed server-side, scoped to one user
                  (the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">sub</code>).
                  Mint one from{' '}
                  <Link to="/overview" className="font-medium text-primary hover:underline">
                    Overview
                  </Link>{' '}
                  or{' '}
                  <Link to="/keys" className="font-medium text-primary hover:underline">
                    API Keys
                  </Link>{' '}
                  — never generate one yourself, and never ship your tenant secret to a browser/mobile app.
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-sm shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Your API host</CardTitle>
                <CardDescription>What every SDK snippet below connects to.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <CodeBlock label="WebSocket URL (SDKs)" code={wsUrl} />
                <CodeBlock label="Portal API URL (REST)" code={apiUrl} />
                <p className="text-xs text-muted-foreground">
                  You never set this yourself — every mint-token call below returns it as <code className="rounded bg-muted px-1 py-0.5 font-mono">ws_url</code>, pass it straight into the SDK.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rest-api" className="mt-0 space-y-4">
            <Section
              title="Mint a token"
              description="Call this from your own backend only — your tenant secret never leaves it. The resulting token is what you hand to an end user's SDK/browser/app. secret accepts your primary secret (Settings) or any additional key pair's secret from API Keys — either works identically here."
              code={`POST ${apiUrl}/api/v1/auth/tokens
Content-Type: application/json

{ "tenant_id": "${tid}", "secret": "<your-tenant-secret>", "sub": "user-42", "ttl_secs": 3600 }`}
              codeLabel="Request"
              language="http"
            >
              <CodeBlock
                label="Response"
                language="json"
                code={`{ "success": true, "data": { "token": "…", "expires_in": 3600, "ws_url": "${wsUrl}" }, "trace_id": "…" }`}
              />
              <p className="text-xs text-muted-foreground">
                Full request/derivation/response sequence:{' '}
                <a
                  href="https://github.com/DalesJuvis/realtime-platform/blob/master/diagrams/auth/issue-client-token/version.md"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  diagrams/auth/issue-client-token
                </a>
                .
              </p>
            </Section>
            <Section
              title="Publish over HTTP"
              description="For a backend with no persistent connection open — a cron job, a webhook handler. Authenticated with a token already minted above, never the raw secret."
              code={`POST ${apiUrl}/api/v1/messages
Content-Type: application/json
Authorization: Bearer <token from /api/v1/auth/tokens>

{ "tenant_id": "${tid}", "channel_id": "orders:42", "payload": "order created" }`}
              codeLabel="Request"
              language="http"
              caveat="No chunking on this endpoint — unlike a connected SDK client, payload must fit in 211 UTF-8 bytes (one protocol frame) or it returns 400 INVALID_REQUEST. Split larger messages into multiple calls, or use a connected SDK client instead."
            >
              <CodeBlock
                label="Response"
                language="json"
                code={`{ "success": true, "data": { "published": true }, "trace_id": "…" }`}
              />
            </Section>
          </TabsContent>

          <TabsContent value="web-push" className="mt-0 space-y-4">
            <Section
              title="Background notifications (tab open, hidden)"
              description="Works today, no server setup needed — shows a native Notification whenever a message arrives while the tab is hidden or unfocused."
              install="npm install @mio/realtime-sdk"
              code={`import { attachBackgroundNotifications, requestNotificationPermission } from '@mio/realtime-sdk'

// On a user gesture (a click) — never auto-request on load:
await requestNotificationPermission()

attachBackgroundNotifications(client, {
  title: (m) => \`#\${m.channelId}\`,
})`}
              language="typescript"
            >
              <p className="text-xs text-muted-foreground">
                For per-channel control instead, call <code className="rounded bg-muted px-1 py-0.5 font-mono">showBackgroundNotification(message, options)</code> directly from a <code className="rounded bg-muted px-1 py-0.5 font-mono">subscribe()</code> callback — same options, same gating.
              </p>
            </Section>
            <Section
              title="Push notifications (tab or browser closed)"
              description="Needs a Service Worker in your app and a backend that sends real encrypted Web Push (VAPID) to the subscription below — see this platform's push_subscriptions endpoint."
              language="typescript"
              code={`import { registerPushServiceWorker, subscribeToPush } from '@mio/realtime-sdk'

const registration = await registerPushServiceWorker('/sw.js')
const subscription = await subscribeToPush(registration, vapidPublicKey)
// subscription: { endpoint, keys: { p256dh, auth } }

await fetch('${apiUrl}/api/v1/push/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },
  body: JSON.stringify({
    tenant_id: '${tid}',
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    channels: ['orders:*'],
  }),
})`}
              caveat="Delivery to a fully-quit browser (not just a closed tab) still depends on the OS/browser waking it for the push — outside any SDK's or server's control."
            />
          </TabsContent>

          <TabsContent value="advanced" className="mt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              Available identically in every persistently-connected SDK — TypeScript, Python, Rust, Android — once <code className="rounded bg-muted px-1 py-0.5 font-mono">client</code> is
              constructed as shown in each SDK's own tab. Not available in the lightweight WordPress browser client (<code className="rounded bg-muted px-1 py-0.5 font-mono">mio-client.js</code>/
              <code className="rounded bg-muted px-1 py-0.5 font-mono">mio-embed.js</code> — deliberately trimmed) or the stateless REST endpoints.
            </p>
            <Section
              title="Wildcard subscribe"
              description="Subscribe to a whole family of channels with a trailing * — every matching channelId routes to the same handler."
              language="typescript"
              code={`client.subscribe('orders:*', (message) => console.log(message.channelId, message.payload))`}
            />
            <Section
              title="Unicast — direct to one user"
              description="Sends to one connected user instead of a channel's subscribers. userId reuses the frame's channelId field, so it inherits the same 24-byte limit."
              language="typescript"
              code={`client.unicast('user-42', 'you have a new order')`}
            >
              <p className="text-xs text-muted-foreground">
                Same method, other SDKs: Python — <code className="rounded bg-muted px-1 py-0.5 font-mono">await client.unicast(...)</code>; Rust/Android —{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">client.unicast(...)</code>.
              </p>
            </Section>
            <Section
              title="Replay — catch up on channel history"
              description="Requests everything published to a channel since sinceUnixSeconds (0 = all available history). Replayed messages arrive through the same subscribe() handler already registered for that channel — no separate callback."
              language="typescript"
              code={`client.subscribe('orders:42', (message) => console.log(message.payload))
client.replay('orders:42', 0)`}
              caveat="Not supported on a wildcard pattern (orders:*) — the server silently ignores a REPLAY request for anything but an exact channel ID."
            >
              <p className="text-xs text-muted-foreground">
                Same method, other SDKs: Python — <code className="rounded bg-muted px-1 py-0.5 font-mono">await client.replay(...)</code>; Rust/Android —{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">client.replay(...)</code>.
              </p>
              <p className="text-xs text-muted-foreground">
                How much history is available is a deployment detail, not a client-side setting — by default each channel keeps only its most recent 50 messages in memory (gone on a restart). With{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">REDIS_URL</code> set on the server, history is durably persisted to Redis instead, capped at{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">HISTORY_STREAM_MAXLEN</code> (default 1000) and surviving restarts — <code className="rounded bg-muted px-1 py-0.5 font-mono">replay()</code> itself doesn't change.
              </p>
            </Section>
            <Section
              title="Automatic chunking — TypeScript only"
              description="Only sdk-typescript's publish()/unicast() transparently split a payload larger than 211 bytes across multiple frames and reassemble it before subscribe() fires. Python/Rust/Android have no chunking module at all — their publish()/unicast() silently truncate an oversized payload at encode time instead: no exception, no error, the tail of the message is just gone."
              language="typescript"
              code={`// TypeScript only — this just works:
client.publish('orders:42', veryLongDescription) // > 211 UTF-8 bytes, chunked automatically

// Python/Rust/Android: check the size yourself first, or split it —
// publish()/unicast() there truncate silently, they don't chunk or throw.`}
              caveat="POST /api/v1/messages and PHP's Client::publish()/emitEvent() take the opposite, safer approach: they reject an oversized payload with an error before any network call, rather than truncating or chunking."
            />
            <Section
              title="Named events, socket.io-style — client.channel()"
              description="TypeScript only for now (Python/Rust/Android don't have this yet — their subscribe()/publish() work unchanged). A channel-scoped handle with on(event, handler)/emit(event, data), for a channel that carries more than one type of message."
              language="typescript"
              code={`const orders = client.channel('orders:42')
orders.on('order.created', (data) => console.log(data.orderId))
orders.emit('order.created', { orderId: 123 })`}
              caveat="Not a protocol change — emit() is a publish() whose payload encodes {event, data} as JSON; on() filters subscribe() for messages matching that shape and event name, silently ignoring anything else on the channel rather than erroring on it."
            >
              <p className="text-xs text-muted-foreground">
                Same envelope as WordPress/Laravel's <code className="rounded bg-muted px-1 py-0.5 font-mono">Client::emitEvent()</code> — an event emitted server-side is received exactly the same way, cross-SDK.
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="typescript" className="mt-0 space-y-4">
            <Section
              title="JavaScript / TypeScript"
              description="Browser, Node.js, and the base for the React/React Native bindings."
              install={'npm install @mio/realtime-sdk\n# Node.js only (pre-v22): WebSocket isn\'t global — the SDK loads this itself, no import needed\nnpm install ws'}
              language="typescript"
              code={`import { createRealtimeClient } from '@mio/realtime-sdk'

const client = createRealtimeClient({
  wsUrl: '${wsUrl}', // from your mint-token response's ws_url — never assembled by hand
  tenantId: '${tid}',
  token: myTokenFromMintToken,
})

const unsubscribe = client.subscribe('orders:42', (message) => {
  console.log(message.channelId, message.payload)
})

client.connect()
client.publish('orders:42', 'order created')

// later:
unsubscribe()
client.disconnect()`}
              caveat="No AUTH acknowledgement in the protocol — the 'authenticated' event fires optimistically right after sending; watch the 'close' event to detect an auth failure instead."
            />
          </TabsContent>

          <TabsContent value="react" className="mt-0 space-y-4">
            <Section
              title="React"
              description="Context + hooks over the TypeScript SDK — no manual useEffect/subscribe/unsubscribe boilerplate."
              install="npm install @mio/realtime-sdk-react @mio/realtime-sdk"
              language="jsx"
              code={`import { RealtimeProvider, useChannel } from '@mio/realtime-sdk-react'

function App() {
  return (
    <RealtimeProvider
      config={{ wsUrl: '${wsUrl}', tenantId: '${tid}', token: myTokenFromMintToken }}
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
}`}
            >
              <p className="text-xs text-muted-foreground">
                Also available: <code className="rounded bg-muted px-1 py-0.5 font-mono">useSubscription</code> (effect-only, no
                re-render), <code className="rounded bg-muted px-1 py-0.5 font-mono">useConnectionState</code>,{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">useBackgroundNotifications</code>,{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">usePushSubscription</code>.
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="react-native" className="mt-0 space-y-4">
            <Section
              title="React Native"
              description="Re-exports the React SDK's hooks/components as-is (none touch the DOM) and adds AppState-aware reconnection — necessary because a backgrounded RN app can be fully suspended by the OS, unlike a browser tab."
              install="npm install @mio/realtime-sdk-react-native @mio/realtime-sdk"
              language="jsx"
              code={`import { RealtimeProvider, useChannel } from '@mio/realtime-sdk-react-native'

function App() {
  return (
    <RealtimeProvider
      config={{ wsUrl: '${wsUrl}', tenantId: '${tid}', token: myTokenFromMintToken }}
    >
      <OrdersFeed />
    </RealtimeProvider>
  )
}

function OrdersFeed() {
  const { messages, publish } = useChannel('orders:42', { limit: 100 })
  // ... same API as @mio/realtime-sdk-react
}`}
              caveat="Notification hooks (useBackgroundNotifications/usePushSubscription) are deliberately NOT re-exported here — they wrap browser-only Notification/PushManager APIs that don't exist in React Native. Native push needs a different mechanism (e.g. @react-native-firebase/messaging)."
            />
          </TabsContent>

          <TabsContent value="python" className="mt-0 space-y-4">
            <Section
              title="Python"
              description="asyncio-based client."
              install="pip install realtime-sdk  # or `pip install -e .` from sdk-python/ in this repo"
              language="python"
              code={`import asyncio
from uuid import UUID
from realtime_sdk import ClientConfig, RealtimeClient

async def main():
    config = ClientConfig(
        url="${wsUrl}", # from your mint-token response's ws_url
        tenant_id=UUID("${tid}"),
        token=my_token_from_mint_token,
    )
    async with RealtimeClient(config) as client:
        client.subscribe("orders:42", lambda msg: print(msg.payload))
        await client.publish("orders:42", "order created")
        await asyncio.sleep(3600)

asyncio.run(main())`}
              caveat="The WebSocket client (client.py) is documented as not yet runtime-tested by its authors — only the pure-stdlib protocol codec has real test coverage. Verify against a live connection before production use."
            />
          </TabsContent>

          <TabsContent value="rust" className="mt-0 space-y-4">
            <Section
              title="Rust"
              description="Tokio-based client."
              install={'[dependencies]\nrealtime-sdk = { path = "../sdk-rust" } # or git/crates.io once published\ntokio = { version = "1", features = ["full"] }'}
              installLabel="Cargo.toml"
              installLanguage="toml"
              language="rust"
              code={`use realtime_sdk::{ClientConfig, RealtimeClient};
use uuid::Uuid;

#[tokio::main]
async fn main() {
    let client = RealtimeClient::connect(ClientConfig {
        url: "${wsUrl}".to_string(), // from your mint-token response's ws_url
        tenant_id: Uuid::parse_str("${tid}").unwrap(),
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
}`}
              caveat="This SDK is documented as not yet compiled by its authors (no Rust toolchain was available when it was written) — run cargo build yourself and treat it as a first draft, not a validated artifact."
            />
          </TabsContent>

          <TabsContent value="android" className="mt-0 space-y-4">
            <Section
              title="Android — Kotlin"
              description="Gradle library module, OkHttp-based. No Maven artifact published yet — integrate as a local module."
              language="kotlin"
              code={`val client = RealtimeClient(
    RealtimeClientConfig(
        url = "${wsUrl}", // from your mint-token response's ws_url
        tenantId = UUID.fromString("${tid}"),
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
client.disconnect()`}
              caveat="Not yet compiled by its authors (no kotlinc/full JDK available when written) — run ./gradlew build test yourself. Callbacks fire on OkHttp's own thread, not the Android main thread — dispatch to the UI thread yourself."
            />
            <Section
              title="Android — Java"
              description="Same client, Java-friendly surface (SAM interfaces, @JvmOverloads)."
              language="java"
              code={`RealtimeClientConfig config = new RealtimeClientConfig(
    "${wsUrl}", // from your mint-token response's ws_url
    UUID.fromString("${tid}"),
    myTokenFromMintToken
);
RealtimeClient client = new RealtimeClient(config);

AutoCloseable subscription = client.subscribe("orders:42",
    message -> System.out.println(message.getPayload()));

client.connect();
client.publish("orders:42", "order created");`}
            />
          </TabsContent>

          <TabsContent value="wordpress" className="mt-0 space-y-4">
            <Section
              title="WordPress — server side (PHP)"
              description="Mint tokens and publish from PHP hooks (save_post, a cron job, ...). Configure Settings > mio Realtime in your WP admin with this tenant's ID and secret first."
              install="composer require mio/realtime-wordpress  # or copy sdk-wordpress/ into wp-content/plugins/"
              language="php"
              code={`use Mio\\Realtime\\Client;

$client = new Client('${apiUrl}', '${tid}', $secret);

$minted = $client->mintToken('user-42'); // -> MintedToken { token, expiresIn, wsUrl }
$client->publish('orders:42', 'order created', $minted->token);

// Named event, same envelope client.channel(id).on() decodes in the browser:
$client->emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);`}
              caveat="Client::publish()/emitEvent() do not chunk — payload over 211 UTF-8 bytes throws before any network call. Never return $secret to the browser — only $minted->token should leave PHP."
            />
            <Section
              title="WordPress — on the page"
              description="A shortcode renders a live-updating feed, backed by a real WebSocket connection in the visitor's browser."
              code={`[mio_realtime channel="orders:42" limit="20" replay="true"]`}
              codeLabel="Add to any page or post"
            >
              <p className="text-xs text-muted-foreground">
                Functional starting point, not a themed component — style <code className="rounded bg-muted px-1 py-0.5 font-mono">.mio-realtime-feed</code> yourself.
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="laravel" className="mt-0 space-y-4">
            <Section
              title="Laravel"
              description="Same framework-independent Mio\Realtime\Client PHP class WordPress uses — it calls zero WordPress functions itself — wired into Laravel's service container: a service provider, a facade, and Laravel's own HTTP client in place of wp_remote_post."
              install={`composer require mio/realtime-laravel\nphp artisan vendor:publish --tag=mio-realtime-config`}
              language="php"
              code={`use Mio\\Realtime\\Laravel\\Facades\\MioRealtime;

$minted = MioRealtime::mintToken('user-42'); // -> MintedToken { token, expiresIn, wsUrl }
MioRealtime::publish('orders:42', 'order created', $minted->token);

// Named event, same envelope client.channel(id).on() decodes:
MioRealtime::emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);`}
              caveat="Same HTTP-only publish path as WordPress — no persistent WebSocket connection, no chunking. publish() throws before any network call if $payload exceeds 211 UTF-8 bytes."
            >
              <CodeBlock
                label=".env"
                language="bash"
                code={`MIO_REALTIME_API_URL=${apiUrl}\nMIO_REALTIME_TENANT_ID=${tid}\nMIO_REALTIME_SECRET=<your-tenant-secret>`}
              />
              <p className="text-xs text-muted-foreground">
                Or resolve <code className="rounded bg-muted px-1 py-0.5 font-mono">Mio\Realtime\Client</code> directly via the container instead of the facade — both reach the same
                bound singleton. See <code className="rounded bg-muted px-1 py-0.5 font-mono">sdk-laravel/README.md</code> for why this package depends on{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">mio/realtime-wordpress</code> (naming leftover, not a functional coupling).
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="embed" className="mt-0 space-y-4">
            <Section
              title="mio-embed.js — no plugin, no build step"
              description="Not WordPress-specific despite living in sdk-wordpress/assets/js/ — a single, dependency-free file for pasting into any HTML page (a Custom HTML block, a theme header/footer, a static site's <head>). No PHP, no framework of any kind."
              language="markup"
              code={`<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.6/sdk-wordpress/assets/js/mio-embed.min.js"
  data-ws-url="${wsUrl}"
  data-tenant-id="${tid}"
  data-token="…"
  data-channel="orders:42"
  data-replay="true"
></script>`}
              caveat="Pin the version: @v0.1.6 above is a git tag — jsDelivr caches tagged refs aggressively, and a future commit can never silently change what's already embedded on someone's site. Never use @master in a URL handed to a third party."
            >
              <p className="text-xs text-muted-foreground">
                No hosting to set up — served straight from GitHub via jsDelivr, globally cached. Uses the committed, terser-minified <code className="rounded bg-muted px-1 py-0.5 font-mono">.min.js</code> build
                (<code className="rounded bg-muted px-1 py-0.5 font-mono">npm run build</code> in <code className="rounded bg-muted px-1 py-0.5 font-mono">sdk-wordpress/</code>) — plain <code className="rounded bg-muted px-1 py-0.5 font-mono">.js</code> source stays in the repo for reading.
                The <code className="rounded bg-muted px-1 py-0.5 font-mono">vanilla-client/</code> directory in this repo is a working local test harness for it.
              </p>
            </Section>
            <Section
              title="mio-protocol.js + mio-client.js — building your own page logic"
              description="For anything beyond the auto-rendered feed above — custom UI, multiple channels, your own publish form — load the two files mio-embed.js bundles and drive MioRealtimeClient yourself."
              language="markup"
              code={`<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.6/sdk-wordpress/assets/js/mio-protocol.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.6/sdk-wordpress/assets/js/mio-client.min.js"></script>
<script>
  var client = new window.MioRealtimeClient({
    wsUrl: '${wsUrl}', // the ws_url from your mint-token response
    tenantId: '${tid}',
    token: '…', // minted server-side, never your tenant secret
  })
  client.subscribe('orders:42', function (message) {
    console.log(message.channelId, message.payload)
  })
  client.connect()
  client.publish('orders:42', 'order created')
</script>`}
            >
              <p className="text-xs text-muted-foreground">
                Not from this CDN: <code className="rounded bg-muted px-1 py-0.5 font-mono">mio-shortcode.js</code> — it only makes sense wired up by the WordPress plugin itself.
              </p>
            </Section>
            <Section
              title="Background notifications — tab hidden or unfocused"
              description="Per-channel, directly in a subscribe() callback — native browser Notification API only, no server setup, no Service Worker, no VAPID keys. Same window.MioEmbedClient API if you're using mio-embed.js instead."
              language="markup"
              code={`<script>
  document.getElementById('enable-notifs').addEventListener('click', function () {
    // On a user gesture (a click) — never auto-request on load:
    window.MioRealtimeClient.requestNotificationPermission()
  })

  client.subscribe('orders:42', function (message) {
    window.MioRealtimeClient.showBackgroundNotification(message, {
      title: function (m) { return '#' + m.channelId },
    })
  })
</script>`}
            >
              <p className="text-xs text-muted-foreground">
                Prefer one call for every subscribed channel instead of per-channel control? <code className="rounded bg-muted px-1 py-0.5 font-mono">window.MioRealtimeClient.attachBackgroundNotifications(client, options)</code> wires the same logic to the client's own <code className="rounded bg-muted px-1 py-0.5 font-mono">'message'</code> event.
              </p>
              <p className="text-xs text-muted-foreground">
                For notifications that also work with the tab or browser fully closed, that needs real Web Push (Service Worker + VAPID keys) — see this page's Web Push tab for the full <code className="rounded bg-muted px-1 py-0.5 font-mono">@mio/realtime-sdk</code> version.
              </p>
            </Section>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
