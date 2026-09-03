/** Docs page — SDK/API reference. Only prose (titles, descriptions, UI
 * labels, caveats, explanatory paragraphs) lives here. Code snippets,
 * inline `<code>` identifiers, install commands, file paths, env var
 * names, and HTTP/error codes stay in English/as-is regardless of
 * language — see DocsPage.tsx for how these are spliced around literal
 * code fragments. */
export const docs = {
  pageTitle: 'Docs',
  pageSubtitle:
    'SDKs and API reference for this workspace — snippets below are filled in with your real tenant ID and API host.',

  // Tabs
  tabGettingStarted: 'Getting started',
  tabRestApi: 'REST API',
  tabWebPush: 'Web Push',
  tabAdvanced: 'Advanced features',
  tabTypescript: 'JavaScript / TypeScript',
  tabReact: 'React',
  tabReactNative: 'React Native',
  tabPython: 'Python',
  tabRust: 'Rust',
  tabAndroid: 'Android (Kotlin/Java)',
  tabWordpress: 'WordPress',
  tabLaravel: 'Laravel',
  tabEmbed: 'Embed script (any site)',

  // Shared CodeBlock/Section labels
  labelInstall: 'Install',
  labelQuickStart: 'Quick start',
  labelRequest: 'Request',
  labelResponse: 'Response',
  labelWsUrl: 'WebSocket URL (SDKs)',
  labelPortalApiUrl: 'Portal API URL (REST)',
  labelAddToPage: 'Add to any page or post',

  // Getting started
  gsTwoThingsTitle: 'Every SDK needs two things',
  gsTenantIdLabel: 'Your tenant ID',
  gsTenantIdText: '— public, safe to embed:',
  gsClientTokenLabel: 'A client token',
  gsClientTokenText1: '— signed server-side, scoped to one user (the',
  gsClientTokenText2: ').',
  gsMintOneFrom: 'Mint one from',
  gsOverviewLink: 'Overview',
  gsOr: 'or',
  gsApiKeysLink: 'API Keys',
  gsNeverGenerate: '— never generate one yourself, and never ship your tenant secret to a browser/mobile app.',
  gsApiHostTitle: 'Your API host',
  gsApiHostDescription: 'What every SDK snippet below connects to.',
  gsApiHostNotePrefix: 'You never set this yourself — every mint-token call below returns it as',
  gsApiHostNoteSuffix: ', pass it straight into the SDK.',

  // REST API
  restApiMintTokenTitle: 'Mint a token',
  restApiMintTokenDescription:
    "Call this from your own backend only — your tenant secret never leaves it. The resulting token is what you hand to an end user's SDK/browser/app. secret accepts your primary secret (Settings) or any additional key pair's secret from API Keys — either works identically here.",
  restApiMintTokenSequencePrefix: 'Full request/derivation/response sequence:',
  restApiMintTokenTtlNote:
    'defaults to 3600 and is capped at 2,592,000 (30 days) — a higher value is silently clamped, never rejected. There\'s no automated renewal once a token expires; for a token hand-pasted into a static site with no backend of its own, mint a longer-lived one from Overview\'s "Mint token" instead of relying on the 1-hour default.',

  restApiPublishTitle: 'Publish over HTTP',
  restApiPublishDescription:
    'For a backend with no persistent connection open — a cron job, a webhook handler. Authenticated with a token already minted above, never the raw secret.',
  restApiPublishCaveat:
    'No chunking on this endpoint — unlike a connected SDK client, payload must fit in 211 UTF-8 bytes (one protocol frame) or it returns 400 INVALID_REQUEST. Split larger messages into multiple calls, or use a connected SDK client instead.',

  restApiPublishTemplateTitle: 'Publish a saved template over HTTP',
  restApiPublishTemplateDescription:
    "Sends one of this workspace's Templates by id instead of a raw payload — {{variable}} placeholders are filled in server-side, so the caller never needs the template's own text or the full template list, only the template_id and the values to fill in.",
  restApiPublishTemplateCaveat:
    "Same 211-byte limit as above, checked after interpolation — 400 INVALID_REQUEST if the rendered text doesn't fit, shorten the template or the values. An unknown or foreign-tenant template_id returns 404 TEMPLATE_NOT_FOUND. A variable with no matching entry renders as an empty string rather than leaving the {{placeholder}} in the sent text.",
  restApiPublishTemplateWrapperPrefix: 'Every connected SDK below wraps this as',
  restApiPublishTemplateWrapperMiddle: "(or that SDK's own naming convention) alongside its existing",
  restApiPublishTemplateWrapperSuffix: "— see each SDK's own tab.",

  // Web Push
  webPushBackgroundTitle: 'Background notifications (tab open, hidden)',
  webPushBackgroundDescription:
    'Works today, no server setup needed — shows a native Notification whenever a message arrives while the tab is hidden or unfocused.',
  webPushBackgroundNotePrefix: 'For per-channel control instead, call',
  webPushBackgroundNoteMiddle: 'directly from a',
  webPushBackgroundNoteSuffix: 'callback — same options, same gating.',

  webPushPushTitle: 'Push notifications (tab or browser closed)',
  webPushPushDescription:
    "Needs a Service Worker in your app (registers it for you) and a backend that sends real encrypted Web Push (VAPID) to the subscription this call registers — see this platform's push_subscriptions endpoint.",
  webPushPushCaveat:
    "Delivery to a fully-quit browser (not just a closed tab) still depends on the OS/browser waking it for the push — outside any SDK's or server's control.",
  webPushPushNotePrefix:
    'registerWebPushSubscription() requests permission, registers your Service Worker, subscribes, and registers with the server in one call. Want to assemble those steps yourself instead? Use',
  webPushPushNoteSuffix: 'directly — the same pieces this function is built from.',
  webPushPushNoDevices: 'No plugin, no build step? See the vanilla',
  webPushPushNoDevicesSuffix: 'embed on the Embed tab instead.',

  // Advanced
  advancedIntroPrefix:
    'Available identically in every persistently-connected SDK — TypeScript, Python, Rust, Android — once',
  advancedIntroMiddle: "is constructed as shown in each SDK's own tab. Not available in the lightweight WordPress browser client (",
  advancedIntroSuffix: '— deliberately trimmed) or the stateless REST endpoints.',

  advancedWildcardTitle: 'Wildcard subscribe',
  advancedWildcardDescription:
    'Subscribe to a whole family of channels with a trailing * — every matching channelId routes to the same handler.',

  advancedUnicastTitle: 'Unicast — direct to one user',
  advancedUnicastDescription:
    "Sends to one connected user instead of a channel's subscribers. userId reuses the frame's channelId field, so it inherits the same 24-byte limit.",

  advancedSameMethodPrefix: 'Same method, other SDKs: Python —',
  advancedSameMethodSeparator: '; Rust/Android —',

  advancedReplayTitle: 'Replay — catch up on channel history',
  advancedReplayDescription:
    'Requests everything published to a channel since sinceUnixSeconds (0 = all available history). Replayed messages arrive through the same subscribe() handler already registered for that channel — no separate callback.',
  advancedReplayCaveat:
    'Not supported on a wildcard pattern (orders:*) — the server silently ignores a REPLAY request for anything but an exact channel ID.',
  advancedReplayHistoryPrefix:
    'How much history is available is a deployment detail, not a client-side setting — by default each channel keeps only its most recent 50 messages in memory (gone on a restart). With',
  advancedReplayHistoryMiddle: 'set on the server, history is durably persisted to Redis instead, capped at',
  advancedReplayHistorySuffix: '(default 1000) and surviving restarts —',
  advancedReplayHistoryEnd: "itself doesn't change.",

  advancedChunkingTitle: 'Automatic chunking — TypeScript only',
  advancedChunkingDescription:
    "Only sdk-typescript's publish()/unicast() transparently split a payload larger than 211 bytes across multiple frames and reassemble it before subscribe() fires. Python/Rust/Android have no chunking module at all — their publish()/unicast() silently truncate an oversized payload at encode time instead: no exception, no error, the tail of the message is just gone.",
  advancedChunkingCaveat:
    "POST /api/v1/messages and PHP's Client::publish()/emitEvent() take the opposite, safer approach: they reject an oversized payload with an error before any network call, rather than truncating or chunking.",

  advancedEventsTitle: 'Named events, socket.io-style — client.channel()',
  advancedEventsDescription:
    "TypeScript only for now (Python/Rust/Android don't have this yet — their subscribe()/publish() work unchanged). A channel-scoped handle with on(event, handler)/emit(event, data), for a channel that carries more than one type of message.",
  advancedEventsCaveat:
    'Not a protocol change — emit() is a publish() whose payload encodes {event, data} as JSON; on() filters subscribe() for messages matching that shape and event name, silently ignoring anything else on the channel rather than erroring on it.',
  advancedEventsEnvelopePrefix: "Same envelope as WordPress/Laravel's",
  advancedEventsEnvelopeSuffix: '— an event emitted server-side is received exactly the same way, cross-SDK.',

  // TypeScript
  tsTitle: 'JavaScript / TypeScript',
  tsDescription: 'Browser, Node.js, and the base for the React/React Native bindings.',
  tsCaveat:
    "No AUTH acknowledgement in the protocol — the 'authenticated' event fires optimistically right after sending. Watch 'authFailed' to detect an auth failure specifically (the server sends a dedicated close code, 4001, for exactly this) rather than inferring it from a generic 'close'.",
  tsGetTokenPrefix: 'For silent renewal instead of handling',
  tsGetTokenMiddle1: 'yourself, replace',
  tsGetTokenMiddle2: 'with',
  tsGetTokenMiddle3: '— called before every connection attempt (including automatically after an',
  tsGetTokenMiddle4: '), calling',
  tsGetTokenYourOwnBackend: 'your own backend',
  tsGetTokenSuffix: ", never mio's API directly.",

  tsPublishTemplateTitle: 'Publish a saved template',
  tsPublishTemplateDescription:
    'Fills in {{variable}} placeholders server-side and publishes the result — see the REST API tab for the endpoint this wraps.',
  tsPublishTemplateCaveat:
    'Goes over HTTP, not the open WS frame stream — works even before connect() or without an open connection, as long as a token (or getToken) is configured. Unlike publish()/unicast(), it is not queued for a not-yet-open socket; each call fires immediately.',

  // React
  reactTitle: 'React',
  reactDescription: 'Context + hooks over the TypeScript SDK — no manual useEffect/subscribe/unsubscribe boilerplate.',
  reactAlsoAvailablePrefix: 'Also available:',
  reactAlsoAvailableParenthetical: '(effect-only, no re-render),',
  reactPublishTemplatePrefix: 'Publish a saved template:',
  reactPublishTemplateMiddle: ', or standalone via',
  reactPublishTemplateSuffix: '— same HTTP call as the REST API tab, {{variable}} filled in server-side.',

  // React Native
  rnTitle: 'React Native',
  rnDescription:
    "Re-exports the React SDK's hooks/components as-is (none touch the DOM) and adds AppState-aware reconnection — necessary because a backgrounded RN app can be fully suspended by the OS, unlike a browser tab.",
  rnCaveat:
    "Notification hooks (useBackgroundNotifications/usePushSubscription) are deliberately NOT re-exported here — they wrap browser-only Notification/PushManager APIs that don't exist in React Native. Native push needs a different mechanism (e.g. @react-native-firebase/messaging).",
  rnReexportSuffix: 'are re-exported unchanged from',
  rnReexportEnd: '— see the React tab.',

  // Python
  pythonTitle: 'Python',
  pythonDescription: 'asyncio-based client.',
  pythonCaveat:
    'The WebSocket client (client.py) is documented as not yet runtime-tested by its authors — only the pure-stdlib protocol codec has real test coverage. Verify against a live connection before production use.',
  pythonPublishTemplatePrefix: 'Publish a saved template —',
  pythonPublishTemplateMiddle:
    '. Unlike the WS client above, this one call is mock-tested (an HTTP request, not a live socket) — see',
  pythonPublishTemplateSuffix: '.',

  // Rust
  rustTitle: 'Rust',
  rustDescription: 'Tokio-based client.',
  rustCaveat:
    'This SDK is documented as not yet compiled by its authors (no Rust toolchain was available when it was written) — run cargo build yourself and treat it as a first draft, not a validated artifact.',
  rustPublishTemplatePrefix: 'Publish a saved template —',
  rustPublishTemplateMiddle: '(an HTTP call, independent of the WS connection above). Unlike the rest of this SDK,',
  rustPublishTemplateMiddle2: 'and its',
  rustPublishTemplateSuffix: 'were actually run and pass.',

  // Android
  androidKotlinTitle: 'Android — Kotlin',
  androidKotlinDescription: 'Gradle library module, OkHttp-based. No Maven artifact published yet — integrate as a local module.',
  androidKotlinCaveat:
    "Not yet compiled by its authors (no kotlinc/full JDK available when written) — run ./gradlew build test yourself. Callbacks fire on OkHttp's own thread, not the Android main thread — dispatch to the UI thread yourself.",
  androidWatchPrefix: 'Watch',
  androidWatchMiddle: 'for an invalid/expired token — without',
  androidWatchMiddle2: ', the client never auto-reconnects after this. Replace',
  androidWatchMiddle3: 'with',
  androidWatchSuffix:
    "for silent renewal — called synchronously on the client's own background thread (safe to block on your backend call) before every connection attempt.",

  androidPublishTemplatePrefix: 'Publish a saved template — callback-based like the rest of this client, not a suspend fun:',
  androidPublishTemplateSuffix: '. Runs over HTTP via the same',
  androidPublishTemplateEnd: 'already configured, independent of the WS connection.',

  androidJavaTitle: 'Android — Java',
  androidJavaDescription: 'Same client, Java-friendly surface (SAM interfaces, @JvmOverloads).',
  androidJavaAuthPrefix: 'Same',
  androidJavaAuthMiddle: 'silent-renewal story as Kotlin above — Java has no named/optional arguments, so pass',
  androidJavaAuthMiddle2: 'for',
  androidJavaAuthSuffix: 'and fill in every parameter through',
  androidJavaAuthEnd: 'explicitly (see the README for the full example).',

  androidJavaPublishTemplatePrefix: 'Publish a saved template —',
  androidJavaPublishTemplateSuffix: '(an overload without the',
  androidJavaPublishTemplateEnd: 'map also exists).',

  // WordPress
  wpServerTitle: 'WordPress — server side (PHP)',
  wpServerDescription:
    "Mint tokens and publish from PHP hooks (save_post, a cron job, ...). Configure Settings > mio Realtime in your WP admin with this tenant's ID and secret first.",
  wpServerCaveat:
    "Client::publish()/emitEvent() do not chunk — payload over 211 UTF-8 bytes throws before any network call. Never return $secret to the browser — only $minted->token should leave PHP.",
  wpServerPublishTemplatePrefix: 'Publish a saved template —',
  wpServerPublishTemplateSuffix:
    '. Same tenant-scoped lookup and server-side {{variable}} filling as the REST API tab — no local size check here, the 211-byte cap is enforced server-side after interpolation.',

  wpPageTitle: 'WordPress — on the page',
  wpPageDescription: "A shortcode renders a live-updating feed, backed by a real WebSocket connection in the visitor's browser.",
  wpPageNotePrefix: 'Functional starting point, not a themed component — style',
  wpPageNoteSuffix: 'yourself.',

  // Laravel
  laravelTitle: 'Laravel',
  laravelDescription:
    "Same framework-independent Mio\\Realtime\\Client PHP class WordPress uses — it calls zero WordPress functions itself — wired into Laravel's service container: a service provider, a facade, and Laravel's own HTTP client in place of wp_remote_post.",
  laravelCaveat:
    'Same HTTP-only publish path as WordPress — no persistent WebSocket connection, no chunking. publish() throws before any network call if $payload exceeds 211 UTF-8 bytes.',
  laravelResolvePrefix: 'Or resolve',
  laravelResolveMiddle: 'directly via the container instead of the facade — both reach the same bound singleton. See',
  laravelResolveMiddle2: 'for why this package depends on',
  laravelResolveSuffix: '(naming leftover, not a functional coupling).',

  laravelPublishTemplatePrefix: 'Publish a saved template — not on the',
  laravelPublishTemplateMiddle: 'facade yet, resolve',
  laravelPublishTemplateMiddle2: 'from the container instead:',
  laravelPublishTemplateSuffix: '.',

  // Embed
  embedScriptTitle: 'mio-embed.js — no plugin, no build step',
  embedScriptDescription:
    "Not WordPress-specific despite living in sdk-wordpress/assets/js/ — a single, dependency-free file for pasting into any HTML page (a Custom HTML block, a theme header/footer, a static site's <head>). No PHP, no framework of any kind.",
  embedScriptCaveat:
    "Pin the version: @v0.1.10 above is a git tag — jsDelivr caches tagged refs aggressively, and a future commit can never silently change what's already embedded on someone's site. Never use @master in a URL handed to a third party.",
  embedScriptNotePrefix:
    'No hosting to set up — served straight from GitHub via jsDelivr, globally cached. Uses the committed, terser-minified',
  embedScriptNoteMiddle: 'build (',
  embedScriptNoteMiddle2: 'in',
  embedScriptNoteMiddle3: ') — plain',
  embedScriptNoteMiddle4: 'source stays in the repo for reading. The',
  embedScriptNoteEnd: 'directory in this repo is a working local test harness for it.',

  embedCustomTitle: 'mio-protocol.js + mio-client.js — building your own page logic',
  embedCustomDescription:
    'For anything beyond the auto-rendered feed above — custom UI, multiple channels, your own publish form — load the two files mio-embed.js bundles and drive MioRealtimeClient yourself.',
  embedCustomNotePrefix: 'Not from this CDN:',
  embedCustomNoteSuffix: '— it only makes sense wired up by the WordPress plugin itself.',

  embedBgTitle: 'Background notifications — tab hidden or unfocused',
  embedBgDescription:
    "Per-channel, directly in a subscribe() callback — native browser Notification API only, no server setup, no Service Worker, no VAPID keys. Same window.MioEmbedClient API if you're using mio-embed.js instead.",
  embedBgNote1Prefix: 'Prefer one call for every subscribed channel instead of per-channel control?',
  embedBgNote1Suffix: "wires the same logic to the client's own",
  embedBgNote1End: 'event.',
  embedBgNote2Prefix:
    "For notifications that also work with the tab or browser fully closed, that needs real Web Push (Service Worker + VAPID keys) — see this page's Web Push tab for the full",
  embedBgNote2Suffix: 'version.',

  embedVapidTitle: 'mio-vapid-subscription.js — Web Push, no plugin, no build step',
  embedVapidDescription:
    'Registers a visitor for real Web Push (tab or browser fully closed) with zero JS to write — wires a button of your choice to request permission, subscribe, and register with your mio backend. Same dependency-free, paste-it-in family as mio-embed.js above.',
  embedVapidCaveat:
    "Notification.requestPermission() only works from a user gesture in effectively every browser, so unlike the live-feed embed above, this file never subscribes anyone on page load — it waits for a click on data-button.",
  embedVapidNotePrefix:
    'On success/failure this dispatches',
  embedVapidNoteMiddle: 'and',
  embedVapidNoteSuffix:
    'CustomEvents on the button element — listen for those to show your own feedback instead of this file imposing one. A Service Worker must already be deployed at data-sw-url (default /sw.js) with push and notificationclick handlers — see this platform\'s public/sw.js for a reference implementation.',
}
