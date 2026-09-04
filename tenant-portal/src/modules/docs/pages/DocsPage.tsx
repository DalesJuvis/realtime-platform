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
 *
 * i18n: only prose (titles/descriptions/labels/caveats/explanatory text)
 * is translated via `useTranslation()` (`t.docs.*`) — every `code={...}`
 * snippet, inline `<code>` identifier, install command, file path, env
 * var name, and HTTP/error code stays in English/as-is regardless of the
 * active language, per standard API-docs practice.
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
import { useTranslation } from '@lib/i18n'
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
  installLabel,
  installLanguage = 'bash',
  code,
  codeLabel,
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
  const { t } = useTranslation()
  return (
    <Card className="rounded-sm shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {install && <CodeBlock label={installLabel ?? t.docs.labelInstall} code={install} language={installLanguage} />}
        <CodeBlock label={codeLabel ?? t.docs.labelQuickStart} code={code} language={language} />
        {children}
        {caveat && <Caveat>{caveat}</Caveat>}
      </CardContent>
    </Card>
  )
}

export default function DocsPage() {
  const { t } = useTranslation()
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
          {t.docs.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{t.docs.pageSubtitle}</p>
      </div>

      <Tabs defaultValue="getting-started" className="flex flex-col gap-6 lg:flex-row">
        <TabsList className="scrollbar-thin h-auto w-full shrink-0 flex-row flex-wrap justify-start gap-1 bg-transparent p-0 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-4rem)] lg:w-56 lg:flex-col lg:items-stretch lg:overflow-y-auto lg:py-4">
          <TabsTrigger value="getting-started" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabGettingStarted}</TabsTrigger>
          <TabsTrigger value="rest-api" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabRestApi}</TabsTrigger>
          <TabsTrigger value="web-push" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabWebPush}</TabsTrigger>
          <TabsTrigger value="advanced" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabAdvanced}</TabsTrigger>
          <TabsTrigger value="typescript" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabTypescript}</TabsTrigger>
          <TabsTrigger value="react" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabReact}</TabsTrigger>
          <TabsTrigger value="react-native" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabReactNative}</TabsTrigger>
          <TabsTrigger value="python" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabPython}</TabsTrigger>
          <TabsTrigger value="rust" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabRust}</TabsTrigger>
          <TabsTrigger value="android" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabAndroid}</TabsTrigger>
          <TabsTrigger value="wordpress" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabWordpress}</TabsTrigger>
          <TabsTrigger value="laravel" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabLaravel}</TabsTrigger>
          <TabsTrigger value="embed" className="justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{t.docs.tabEmbed}</TabsTrigger>
        </TabsList>

        <div className="min-w-0 flex-1 space-y-6">
          <TabsContent value="getting-started" className="mt-0 space-y-4">
            <Card className="rounded-sm border-none bg-primary/5 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  {t.docs.gsTwoThingsTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">{t.docs.gsTenantIdLabel}</strong> {t.docs.gsTenantIdText}{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{tid}</code>
                </p>
                <p>
                  <strong className="text-foreground">{t.docs.gsClientTokenLabel}</strong> {t.docs.gsClientTokenText1}{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">sub</code>
                  {t.docs.gsClientTokenText2}{' '}
                  {t.docs.gsMintOneFrom}{' '}
                  <Link to="/overview" className="font-medium text-primary hover:underline">
                    {t.docs.gsOverviewLink}
                  </Link>{' '}
                  {t.docs.gsOr}{' '}
                  <Link to="/keys" className="font-medium text-primary hover:underline">
                    {t.docs.gsApiKeysLink}
                  </Link>{' '}
                  {t.docs.gsNeverGenerate}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-sm shadow-none">
              <CardHeader>
                <CardTitle className="text-base">{t.docs.gsApiHostTitle}</CardTitle>
                <CardDescription>{t.docs.gsApiHostDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <CodeBlock label={t.docs.labelWsUrl} code={wsUrl} />
                <CodeBlock label={t.docs.labelPortalApiUrl} code={apiUrl} />
                <p className="text-xs text-muted-foreground">
                  {t.docs.gsApiHostNotePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">ws_url</code>{t.docs.gsApiHostNoteSuffix}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rest-api" className="mt-0 space-y-4">
            <Section
              title={t.docs.restApiMintTokenTitle}
              description={t.docs.restApiMintTokenDescription}
              code={`POST ${apiUrl}/api/v1/auth/tokens
Content-Type: application/json

{ "tenant_id": "${tid}", "secret": "<your-tenant-secret>", "sub": "user-42", "ttl_secs": 3600 }`}
              codeLabel={t.docs.labelRequest}
              language="http"
            >
              <CodeBlock
                label={t.docs.labelResponse}
                language="json"
                code={`{ "success": true, "data": { "token": "…", "expires_in": 3600, "ws_url": "${wsUrl}" }, "trace_id": "…" }`}
              />
              <p className="text-xs text-muted-foreground">
                {t.docs.restApiMintTokenSequencePrefix}{' '}
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
              <p className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 font-mono">ttl_secs</code> {t.docs.restApiMintTokenTtlNote}
              </p>
            </Section>
            <Section
              title={t.docs.restApiPublishTitle}
              description={t.docs.restApiPublishDescription}
              code={`POST ${apiUrl}/api/v1/messages
Content-Type: application/json
Authorization: Bearer <token from /api/v1/auth/tokens>

{ "tenant_id": "${tid}", "channel_id": "orders:42", "payload": "order created" }`}
              codeLabel={t.docs.labelRequest}
              language="http"
              caveat={t.docs.restApiPublishCaveat}
            >
              <CodeBlock
                label={t.docs.labelResponse}
                language="json"
                code={`{ "success": true, "data": { "published": true }, "trace_id": "…" }`}
              />
            </Section>
            <Section
              title={t.docs.restApiPublishTemplateTitle}
              description={t.docs.restApiPublishTemplateDescription}
              code={`POST ${apiUrl}/api/v1/messages/template
Content-Type: application/json
Authorization: Bearer <token from /api/v1/auth/tokens>

{
  "tenant_id": "${tid}",
  "channel_id": "orders:42",
  "template_id": "<template id from Templates>",
  "variables": { "name": "Ada", "order_id": "42" }
}`}
              codeLabel={t.docs.labelRequest}
              language="http"
              caveat={t.docs.restApiPublishTemplateCaveat}
            >
              <CodeBlock
                label={t.docs.labelResponse}
                language="json"
                code={`{ "success": true, "data": { "published": true }, "trace_id": "…" }`}
              />
              <p className="text-xs text-muted-foreground">
                {t.docs.restApiPublishTemplateWrapperPrefix}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">publishTemplate(channelId, templateId, variables)</code>{' '}
                {t.docs.restApiPublishTemplateWrapperMiddle} <code className="rounded bg-muted px-1 py-0.5 font-mono">publish()</code>{' '}
                {t.docs.restApiPublishTemplateWrapperSuffix}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="web-push" className="mt-0 space-y-4">
            <Section
              title={t.docs.webPushBackgroundTitle}
              description={t.docs.webPushBackgroundDescription}
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
                {t.docs.webPushBackgroundNotePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">showBackgroundNotification(message, options)</code>{' '}
                {t.docs.webPushBackgroundNoteMiddle} <code className="rounded bg-muted px-1 py-0.5 font-mono">subscribe()</code> {t.docs.webPushBackgroundNoteSuffix}
              </p>
            </Section>
            <Section
              title={t.docs.webPushPushTitle}
              description={t.docs.webPushPushDescription}
              language="typescript"
              code={`import { registerWebPushSubscription } from '@mio/realtime-sdk'

const { subscription } = await registerWebPushSubscription({
  apiBaseUrl: '${apiUrl}',
  token,          // minted server-side, never your tenant secret
  tenantId: '${tid}',
  vapidPublicKey,
  channels: ['orders:*'], // defaults to ['*'] (every channel)
})
// subscription: { endpoint, keys: { p256dh, auth } }`}
              caveat={t.docs.webPushPushCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.webPushPushNotePrefix}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">registerPushServiceWorker</code>,{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">subscribeToPush</code>{' '}
                {t.docs.webPushPushNoteSuffix}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.docs.webPushPushNoDevices} <code className="rounded bg-muted px-1 py-0.5 font-mono">mio-vapid-subscription.js</code>{' '}
                {t.docs.webPushPushNoDevicesSuffix}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="advanced" className="mt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t.docs.advancedIntroPrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">client</code>{' '}
              {t.docs.advancedIntroMiddle}<code className="rounded bg-muted px-1 py-0.5 font-mono">mio-client.js</code>/
              <code className="rounded bg-muted px-1 py-0.5 font-mono">mio-embed.js</code> {t.docs.advancedIntroSuffix}
            </p>
            <Section
              title={t.docs.advancedWildcardTitle}
              description={t.docs.advancedWildcardDescription}
              language="typescript"
              code={`client.subscribe('orders:*', (message) => console.log(message.channelId, message.payload))`}
            />
            <Section
              title={t.docs.advancedUnicastTitle}
              description={t.docs.advancedUnicastDescription}
              language="typescript"
              code={`client.unicast('user-42', 'you have a new order')`}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.advancedSameMethodPrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">await client.unicast(...)</code>{t.docs.advancedSameMethodSeparator}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">client.unicast(...)</code>.
              </p>
            </Section>
            <Section
              title={t.docs.advancedReplayTitle}
              description={t.docs.advancedReplayDescription}
              language="typescript"
              code={`client.subscribe('orders:42', (message) => console.log(message.payload))
client.replay('orders:42', 0)`}
              caveat={t.docs.advancedReplayCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.advancedSameMethodPrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">await client.replay(...)</code>{t.docs.advancedSameMethodSeparator}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">client.replay(...)</code>.
              </p>
              <p className="text-xs text-muted-foreground">
                {t.docs.advancedReplayHistoryPrefix}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">REDIS_URL</code> {t.docs.advancedReplayHistoryMiddle}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">HISTORY_STREAM_MAXLEN</code> {t.docs.advancedReplayHistorySuffix}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">replay()</code> {t.docs.advancedReplayHistoryEnd}
              </p>
            </Section>
            <Section
              title={t.docs.advancedChunkingTitle}
              description={t.docs.advancedChunkingDescription}
              language="typescript"
              code={`// TypeScript only — this just works:
client.publish('orders:42', veryLongDescription) // > 211 UTF-8 bytes, chunked automatically

// Python/Rust/Android: check the size yourself first, or split it —
// publish()/unicast() there truncate silently, they don't chunk or throw.`}
              caveat={t.docs.advancedChunkingCaveat}
            />
            <Section
              title={t.docs.advancedEventsTitle}
              description={t.docs.advancedEventsDescription}
              language="typescript"
              code={`const orders = client.channel('orders:42')
orders.on('order.created', (data) => console.log(data.orderId))
orders.emit('order.created', { orderId: 123 })`}
              caveat={t.docs.advancedEventsCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.advancedEventsEnvelopePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">Client::emitEvent()</code>{' '}
                {t.docs.advancedEventsEnvelopeSuffix}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="typescript" className="mt-0 space-y-4">
            <Section
              title={t.docs.tsTitle}
              description={t.docs.tsDescription}
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

client.on('authFailed', ({ code, reason }) => {
  // Invalid or expired token. Without getToken configured (see below),
  // the client never auto-reconnects after this, even with reconnect:
  // true — mint a fresh token and construct a new client instead.
})

// later:
unsubscribe()
client.disconnect()`}
              caveat={t.docs.tsCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.tsGetTokenPrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">authFailed</code> {t.docs.tsGetTokenMiddle1}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">token</code> {t.docs.tsGetTokenMiddle2}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">getToken: async () =&gt; ({'{'} token, wsUrl {'}'})</code>{' '}
                {t.docs.tsGetTokenMiddle3} <code className="rounded bg-muted px-1 py-0.5 font-mono">authFailed</code>{t.docs.tsGetTokenMiddle4}{' '}
                <b>{t.docs.tsGetTokenYourOwnBackend}</b>{t.docs.tsGetTokenSuffix}
              </p>
            </Section>
            <Section
              title={t.docs.tsPublishTemplateTitle}
              description={t.docs.tsPublishTemplateDescription}
              language="typescript"
              code={`await client.publishTemplate('orders:42', '<template id from Templates>', {
  name: 'Ada',
  order_id: '42',
})`}
              caveat={t.docs.tsPublishTemplateCaveat}
            />
          </TabsContent>

          <TabsContent value="react" className="mt-0 space-y-4">
            <Section
              title={t.docs.reactTitle}
              description={t.docs.reactDescription}
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
                {t.docs.reactAlsoAvailablePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">useSubscription</code>{' '}
                {t.docs.reactAlsoAvailableParenthetical} <code className="rounded bg-muted px-1 py-0.5 font-mono">useConnectionState</code>,{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">useBackgroundNotifications</code>,{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">usePushSubscription</code>.
              </p>
              <p className="text-xs text-muted-foreground">
                {t.docs.reactPublishTemplatePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">useChannel(...).publishTemplate(templateId, variables)</code>{t.docs.reactPublishTemplateMiddle}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">usePublishTemplate(channelId)</code> {t.docs.reactPublishTemplateSuffix}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="react-native" className="mt-0 space-y-4">
            <Section
              title={t.docs.rnTitle}
              description={t.docs.rnDescription}
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
              caveat={t.docs.rnCaveat}
            >
              <p className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 font-mono">publishTemplate</code>/<code className="rounded bg-muted px-1 py-0.5 font-mono">usePublishTemplate</code> {t.docs.rnReexportSuffix}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">@mio/realtime-sdk-react</code> {t.docs.rnReexportEnd}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="python" className="mt-0 space-y-4">
            <Section
              title={t.docs.pythonTitle}
              description={t.docs.pythonDescription}
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
              caveat={t.docs.pythonCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.pythonPublishTemplatePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">await client.publish_template("orders:42", template_id, {'{'}"name": "Ada"{'}'})</code>.
                {t.docs.pythonPublishTemplateMiddle} <code className="rounded bg-muted px-1 py-0.5 font-mono">sdk-python/README.md</code>{t.docs.pythonPublishTemplateSuffix}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="rust" className="mt-0 space-y-4">
            <Section
              title={t.docs.rustTitle}
              description={t.docs.rustDescription}
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
              caveat={t.docs.rustCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.rustPublishTemplatePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">client.publish_template("orders:42", template_id, &amp;variables).await.unwrap();</code>{' '}
                {t.docs.rustPublishTemplateMiddle} <code className="rounded bg-muted px-1 py-0.5 font-mono">publish_template</code> {t.docs.rustPublishTemplateMiddle2}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">cargo build</code>/<code className="rounded bg-muted px-1 py-0.5 font-mono">cargo test</code> {t.docs.rustPublishTemplateSuffix}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="android" className="mt-0 space-y-4">
            <Section
              title={t.docs.androidKotlinTitle}
              description={t.docs.androidKotlinDescription}
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
              caveat={t.docs.androidKotlinCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.androidWatchPrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">ConnectionEvent.AuthFailed</code> {t.docs.androidWatchMiddle}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">tokenProvider</code>{t.docs.androidWatchMiddle2}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">token</code> {t.docs.androidWatchMiddle3}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">tokenProvider = TokenProvider {'{'} ... {'}'}</code> {t.docs.androidWatchSuffix}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.docs.androidPublishTemplatePrefix}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">client.publishTemplate("orders:42", templateId, mapOf("name" to "Ada")) {'{'} result -&gt; ... {'}'}</code>
                {t.docs.androidPublishTemplateSuffix} <code className="rounded bg-muted px-1 py-0.5 font-mono">OkHttpClient</code> {t.docs.androidPublishTemplateEnd}
              </p>
            </Section>
            <Section
              title={t.docs.androidJavaTitle}
              description={t.docs.androidJavaDescription}
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
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.androidJavaAuthPrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">ConnectionEvent.AuthFailed</code>/<code className="rounded bg-muted px-1 py-0.5 font-mono">tokenProvider</code>{' '}
                {t.docs.androidJavaAuthMiddle} <code className="rounded bg-muted px-1 py-0.5 font-mono">null</code> {t.docs.androidJavaAuthMiddle2}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">token</code> {t.docs.androidJavaAuthSuffix}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">tokenProvider</code> {t.docs.androidJavaAuthEnd}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.docs.androidJavaPublishTemplatePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">client.publishTemplate("orders:42", templateId, result -&gt; {'{'} ... {'}'});</code>{' '}
                {t.docs.androidJavaPublishTemplateSuffix} <code className="rounded bg-muted px-1 py-0.5 font-mono">variables</code> {t.docs.androidJavaPublishTemplateEnd}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="wordpress" className="mt-0 space-y-4">
            <Section
              title={t.docs.wpServerTitle}
              description={t.docs.wpServerDescription}
              install="composer require mio/realtime-wordpress  # or copy sdk-wordpress/ into wp-content/plugins/"
              language="php"
              code={`use Mio\\Realtime\\Client;

$client = new Client('${apiUrl}', '${tid}', $secret);

$minted = $client->mintToken('user-42'); // -> MintedToken { token, expiresIn, wsUrl }
$client->publish('orders:42', 'order created', $minted->token);

// Named event, same envelope client.channel(id).on() decodes in the browser:
$client->emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);`}
              caveat={t.docs.wpServerCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.wpServerPublishTemplatePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">$client-&gt;publishTemplate('orders:42', $templateId, $minted-&gt;token, ['name' =&gt; 'Ada']);</code>{t.docs.wpServerPublishTemplateSuffix}
              </p>
            </Section>
            <Section
              title={t.docs.wpPageTitle}
              description={t.docs.wpPageDescription}
              code={`[mio_realtime channel="orders:42" limit="20" replay="true"]`}
              codeLabel={t.docs.labelAddToPage}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.wpPageNotePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">.mio-realtime-feed</code> {t.docs.wpPageNoteSuffix}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="laravel" className="mt-0 space-y-4">
            <Section
              title={t.docs.laravelTitle}
              description={t.docs.laravelDescription}
              install={`composer require mio/realtime-laravel\nphp artisan vendor:publish --tag=mio-realtime-config`}
              language="php"
              code={`use Mio\\Realtime\\Laravel\\Facades\\MioRealtime;

$minted = MioRealtime::mintToken('user-42'); // -> MintedToken { token, expiresIn, wsUrl }
MioRealtime::publish('orders:42', 'order created', $minted->token);

// Named event, same envelope client.channel(id).on() decodes:
MioRealtime::emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);`}
              caveat={t.docs.laravelCaveat}
            >
              <CodeBlock
                label=".env"
                language="bash"
                code={`MIO_REALTIME_API_URL=${apiUrl}\nMIO_REALTIME_TENANT_ID=${tid}\nMIO_REALTIME_SECRET=<your-tenant-secret>`}
              />
              <p className="text-xs text-muted-foreground">
                {t.docs.laravelResolvePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">Mio\Realtime\Client</code> {t.docs.laravelResolveMiddle}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">sdk-laravel/README.md</code> {t.docs.laravelResolveMiddle2}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">mio/realtime-wordpress</code> {t.docs.laravelResolveSuffix}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.docs.laravelPublishTemplatePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">MioRealtime</code> {t.docs.laravelPublishTemplateMiddle}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">LaravelHttpTransport</code> {t.docs.laravelPublishTemplateMiddle2}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">app(\Mio\Realtime\Laravel\LaravelHttpTransport::class)-&gt;publishTemplate('orders:42', $templateId, $minted-&gt;token, ['name' =&gt; 'Ada']);</code>{t.docs.laravelPublishTemplateSuffix}
              </p>
            </Section>
          </TabsContent>

          <TabsContent value="embed" className="mt-0 space-y-4">
            <Section
              title={t.docs.embedScriptTitle}
              description={t.docs.embedScriptDescription}
              language="markup"
              code={`<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.11/sdk-wordpress/assets/js/mio-embed.min.js"
  data-ws-url="${wsUrl}"
  data-tenant-id="${tid}"
  data-token="…"
  data-channel="orders:42"
  data-replay="true"
></script>`}
              caveat={t.docs.embedScriptCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.embedScriptNotePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">.min.js</code> {t.docs.embedScriptNoteMiddle}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">npm run build</code> {t.docs.embedScriptNoteMiddle2}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">sdk-wordpress/</code>{t.docs.embedScriptNoteMiddle3} <code className="rounded bg-muted px-1 py-0.5 font-mono">.js</code>{' '}
                {t.docs.embedScriptNoteMiddle4} <code className="rounded bg-muted px-1 py-0.5 font-mono">vanilla-client/</code> {t.docs.embedScriptNoteEnd}
              </p>
            </Section>
            <Section
              title={t.docs.embedVapidTitle}
              description={t.docs.embedVapidDescription}
              language="markup"
              code={`<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.11/sdk-wordpress/assets/js/mio-vapid-subscription.min.js"
  data-api-base-url="${apiUrl}"
  data-tenant-id="${tid}"
  data-token="…"
  data-vapid-public-key="…"
  data-channels="orders:*"
  data-button="#enable-notifications"
></script>
<button id="enable-notifications">Enable notifications</button>`}
              caveat={t.docs.embedVapidCaveat}
            >
              <p className="text-xs text-muted-foreground">
                {t.docs.embedVapidNotePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">mio:vapid-subscribed</code> {t.docs.embedVapidNoteMiddle}{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">mio:vapid-subscription-error</code> {t.docs.embedVapidNoteSuffix}
              </p>
            </Section>
            <Section
              title={t.docs.embedCustomTitle}
              description={t.docs.embedCustomDescription}
              language="markup"
              code={`<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.11/sdk-wordpress/assets/js/mio-protocol.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.11/sdk-wordpress/assets/js/mio-client.min.js"></script>
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
                {t.docs.embedCustomNotePrefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">mio-shortcode.js</code> {t.docs.embedCustomNoteSuffix}
              </p>
            </Section>
            <Section
              title={t.docs.embedBgTitle}
              description={t.docs.embedBgDescription}
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
                {t.docs.embedBgNote1Prefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">window.MioRealtimeClient.attachBackgroundNotifications(client, options)</code>{' '}
                {t.docs.embedBgNote1Suffix} <code className="rounded bg-muted px-1 py-0.5 font-mono">'message'</code> {t.docs.embedBgNote1End}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.docs.embedBgNote2Prefix} <code className="rounded bg-muted px-1 py-0.5 font-mono">@mio/realtime-sdk</code> {t.docs.embedBgNote2Suffix}
              </p>
            </Section>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
