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
4. **The fixed frame payload is 211 UTF-8 bytes.** Only TypeScript's
   `publish()`/`unicast()`/`channel().emit()` chunk transparently above
   that (no data loss). **Python/Rust/Android silently truncate** an
   oversized payload instead — no error, no exception, data just
   disappears — so check the size yourself before calling
   `publish()`/`unicast()` in those three. The stateless REST
   `POST /api/v1/messages` and PHP's `Client::publish()`/`emitEvent()`
   take the safe opposite approach: they reject an oversized payload
   with an error before any network call. See the feature matrix in §8
   for the full breakdown.
5. **`channel_id` is capped at 24 UTF-8 bytes.** Same cap applies to
   `userId` in `unicast()` (it reuses the same wire field).
6. **There is no AUTH acknowledgement opcode.** A client's
   `authenticated`/`open` event fires optimistically right after sending
   AUTH; a failed auth surfaces as the server closing the connection with
   a dedicated WS close code (`4001` — `WsController.rs::WS_CLOSE_CODE_AUTH_FAILED`),
   which every SDK (TypeScript, the WordPress family, Python) turns into
   an `authFailed` event/log instead of blindly reconnecting with the same
   now-invalid token. Never write code that assumes a synchronous "auth
   succeeded" signal exists, and never assume a generic `close` handler
   alone tells you *why* — check for `authFailed` specifically.
7. **REPLAY only works on an exact `channel_id`, never a wildcard
   pattern** (`orders:*`) — the server silently no-ops a REPLAY on a
   pattern rather than erroring.
8. **No SDK assembles its own WebSocket URL.** Every mint-token response
   carries a `ws_url` the server derives itself (from the request's own
   domain, or an operator-set override) — pass it straight into the
   SDK's `wsUrl`/`url` config field. Never construct one from a
   `host`/`port`/`secure` triple: production puts the WS endpoint on the
   same domain as the REST API with no port at all
   (`wss://example.com/ws`), which a client-supplied default can't know.

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
| chunking | TypeScript-SDK-only (never protocol-side, never in Python/Rust/Android) splitting of a payload >211 bytes into multiple PUB/UNICAST frames, reassembled on the receiving end before the app-level handler fires. See §8's feature matrix. |

## 3. Auth model

```
1. Your own backend holds a tenant secret (primary or an extra key pair).
2. Your backend calls POST /api/v1/auth/tokens with {tenant_id, secret, sub, ttl_secs}.
3. The server verifies `secret` against ANY of the tenant's currently-active
   secrets (primary + extra pairs), and returns a signed token PLUS a
   ws_url it derives itself from this request's own domain (or an
   operator-configured override) — never something the caller supplies.
4. Your backend hands the token and ws_url to the end user (browser/app).
5. The end user's SDK connects/authenticates with {wsUrl, tenantId, token} —
   never sees tenant_id+secret together, never sees the secret at all, and
   never assembles wsUrl itself.
```

Full sequence, including the `ws_url` derivation logic itself:
[`diagrams/auth/issue-client-token/version.md`](diagrams/auth/issue-client-token/version.md).

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
  `/api/v1/messages/template`, `/api/v1/push/subscriptions`). Safe to
  expose publicly.
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
| POST | `/api/v1/auth/tokens` | secret in body | Mint a client token. `{tenant_id, secret, sub, ttl_secs?}` → `{token, expires_in, ws_url}`. Server-to-server only. `ttl_secs` defaults to 3600 (1h), silently clamped to 2,592,000 (30d) if higher — never rejected. |
| POST | `/api/v1/portal/auth/signup` | none | Self-serve: create a brand-new tenant + primary key pair + login account from `{email, password}`. `201`, returns `{access_token, token_type, expires_in, keys: {tenant_id, secret_key}}`. |
| POST | `/api/v1/portal/auth/register` | tenant secret in body | Create a portal login for a tenant an admin already provisioned, proving ownership via its real secret. `201`, logs in. |
| POST | `/api/v1/portal/auth/login` | none | Email/password login → portal session token. |
| GET | `/api/v1/system/health` | none | Liveness probe, plain text `"ok"`. |
| GET | `/api/v1/system/metrics` | none | Prometheus text exposition. |

### Client-token-authenticated (`Authorization: Bearer <client token>`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/messages` | HTTP publish, no persistent connection needed. `{tenant_id, channel_id, payload}` → `{published: true}`. No chunking — 211-byte cap. |
| POST | `/api/v1/messages/template` | Publish a saved template by id instead of a raw payload — `{{variable}}` filled in server-side. `{tenant_id, channel_id, template_id, variables}` → `{published: true}`. Template looked up scoped to this token's own `tenant_id` (foreign/unknown id → `404 TEMPLATE_NOT_FOUND`, indistinguishable). 211-byte cap checked *after* rendering. A variable with no matching entry renders empty, not the literal placeholder. Every connected SDK wraps this as `publishTemplate`/`publish_template` alongside its `publish()`. |
| POST | `/api/v1/push/subscriptions` | Register a Web Push subscription: `{tenant_id, endpoint, keys: {p256dh, auth}, channels: [...]}`. |
| DELETE | `/api/v1/push/subscriptions` | Unregister by `endpoint`. |

### Portal-session-authenticated (`Authorization: Bearer <portal session token>`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/portal/sessions` | Live WS/TCP connections for this tenant ("devices"). |
| POST | `/api/v1/portal/tokens` | Mint a client token from an already-authenticated portal session (no secret needed in the request). Same `ttl_secs` default/cap as `/api/v1/auth/tokens` above. |
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
| `TEMPLATE_NOT_FOUND` | 404 | template update/delete, or `POST /api/v1/messages/template` with an unknown/foreign-tenant `template_id` |
| `CHANNEL_ID_TOO_LONG` | 400 | portal broadcast, >24 bytes |
| `PAYLOAD_TOO_LARGE` | 400 | portal broadcast, >211 bytes |
| `RATE_LIMITED` | 429 | portal broadcast, `POST /api/v1/messages`, or `POST /api/v1/messages/template`, quota exhausted |
| `INVALID_LOGO` | 400 | bad MIME type or >2 MB decoded |
| `WEAK_PASSWORD` | 400 | new password <8 chars |
| `STORAGE_ERROR` | 500 | underlying DB error, any portal/push route |
| `UNAUTHORIZED` | 401 | missing/invalid session or admin token; client token doesn't validate for the given `tenant_id` |
| `MISSING_TOKEN` | 401 | `Authorization` header absent/malformed on `/api/v1/messages`, `/api/v1/messages/template`, or push routes |
| `INVALID_REQUEST` | 400 | `POST /api/v1/messages` body fails validation (channel/payload size); same for `/api/v1/messages/template`, but payload size is checked *after* `{{variable}}` interpolation |
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
- **Automatic chunking — TypeScript only**: `publish()`/`unicast()`
  transparently split payloads >211 bytes across multiple frames and
  reassemble on receipt — nothing to configure. Python/Rust/Android
  have no equivalent: their `publish()`/`unicast()` silently truncate
  an oversized payload instead (no error). `POST /api/v1/messages` and
  PHP's `Client` reject an oversized payload outright rather than
  truncating or chunking. Full breakdown in §8's feature matrix.
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

### Cross-SDK feature matrix

| Capability | TypeScript | Python | Rust | Android | `mio-client.js`/`mio-embed.js` (WordPress, lightweight) | PHP `Client` (WordPress/Laravel) |
|---|---|---|---|---|---|---|
| Persistent WS connection | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (HTTP request/response only, no held connection) |
| `publish(channelId, payload)` | ✅ | ✅ `await` | ✅ | ✅ | ✅ | ✅ HTTP, `mintToken()`'d token required |
| `subscribe(channelId, handler)` — exact | ✅ returns `Unsubscribe` | ✅ returns `Unsubscribe` | ✅ returns `broadcast::Receiver` | ✅ returns `AutoCloseable` | ✅ | ❌ |
| `subscribe` — wildcard `orders:*` | ✅ | ✅ | ✅ | ✅ | ❌ (deliberately trimmed) | ❌ |
| `unicast(userId, payload)` | ✅ | ✅ `await` | ✅ | ✅ | ❌ (deliberately trimmed) | ❌ |
| `replay(channelId, since?)` | ✅ | ✅ `await` | ✅ | ✅ | ✅ via `data-replay` attr only (embed) | ❌ |
| Oversized payload (>211 bytes) handling | **transparent multi-frame chunking, no data loss** | **silent truncation, no error, no chunking — data loss** | **silent truncation, no error, no chunking — data loss** | **silent truncation, no error, no chunking — data loss** | throws (no chunking) | throws `ClientException` before any network call |
| Explicit `unsubscribe`/`off` semantics | per-handler; last handler removed → real `UNSUB` frame | per-handler; last handler removed → real `UNSUB` frame | **not per-handler** — one shared bus per channel; `unsubscribe(channel_id)` kills it for every `Receiver` at once | per-listener; last listener removed → real `UNSUB` frame | n/a | n/a |
| Named events `channel(id).on()`/`.emit()` | ✅ (only SDK with this) | ❌ | ❌ | ❌ | ❌ | ✅ emit-only, `Client::emitEvent()` (no receive side — PHP has no persistent connection to receive on) |
| Connection lifecycle events | ✅ `client.on("open"\|"close"\|"error"\|"authenticated"\|"authFailed")` | not a separate public API (internal only) | not a separate public API (internal only) | ✅ `ConnectionEvent` sealed class via `onConnectionEvent()`, incl. `AuthFailed` | ✅ (event emitter), incl. `'authFailed'` | n/a |
| Reconnect (auto, exp. backoff + jitter, resubscribe) | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Dedicated close code (4001) for auth failure, detected client-side | ✅ never blindly retries the same rejected token | ❌ logs and stops the reconnect loop instead (no event/callback system in this SDK yet) | ❌ **not implemented** — still hits the original bug: retries a rejected token forever with backoff, same as every SDK before this fix | ✅ never blindly retries the same rejected token | ✅ never blindly retries the same rejected token | n/a |
| Silent token renewal (`getToken`/`tokenProvider`, calls **your own backend**) | ✅ | ❌ not built — see above | ❌ not built | ✅ `TokenProvider`, blocking call on the client's own background executor thread | ❌ not built (only the `authFailed` event above; renew by minting + reconstructing the client yourself) | n/a |
| Mints its own token | ❌ never — see §1.2 | ❌ never | ❌ never | ❌ never | ❌ never | ✅ `mintToken()` (this is the one SDK that's allowed to — it's server-side) |
| Compiled/tested by its authors | ✅ | partial (codec only) | ❌ | ❌ | ✅ | ✅ |

The truncation-vs-chunking row is the one most likely to bite a
generated integration: **do not assume Python/Rust/Android SDKs are
safe to `publish()`/`unicast()` an arbitrarily long string.** Check
`len(payload.encode('utf-8')) <= 211` (or the language equivalent)
yourself first, or split it into multiple calls.

### TypeScript (`@mio/realtime-sdk`) — browser, Node.js, base for React/RN

```bash
npm install @mio/realtime-sdk
npm install ws   # Node.js only, pre-v22 (no global WebSocket)
```
```typescript
import { createRealtimeClient } from '@mio/realtime-sdk'

const client = createRealtimeClient({
  wsUrl: wsUrlFromMintToken, // ws_url from the mint-token response, never assembled by hand
  tenantId: '<tenant-id>', token: myTokenFromMintToken,
})
const unsubscribe = client.subscribe('orders:42', (message) => {
  console.log(message.channelId, message.payload)
})
client.connect()
client.publish('orders:42', 'order created')
```
No AUTH ack (see §1.6) — watch `close`, not just `authenticated`.

**Full API — `RealtimeClient` / `createRealtimeClient(config): RealtimeAdapter`**

`RealtimeClientConfig` fields: `wsUrl: string` — the exact `ws_url` the mint-token response returns, connected to as-is (see §1 rule 8: the SDK never assembles a URL from a host/port/secure/path); `tenantId: string`; exactly one of `token: string` (static) or `getToken: () => Promise<{token: string; wsUrl?: string}>` (enforced by the type — a discriminated union, not runtime validation) — `getToken` is called before every connection attempt (first `connect()` and every reconnect, including right after `authFailed`), so it's the mechanism for silent token renewal: call your own backend inside it (never mio's API directly, never with the tenant secret client-side), and a rejection is treated like any other connection failure (`error` emitted, reconnect scheduled with the normal backoff, no tight retry loop); `heartbeatIntervalMs?: number` (default 15000); `reconnect?: boolean` (default true); `reconnectBaseDelayMs?: number` (default 500); `reconnectMaxDelayMs?: number` (default 15000); `maxMessageBytes?: number` (default 65536 — a sanity cap on chunked payload size, not a protocol limit); `webSocketImpl?: new (url: string) => WebSocketLike` (test/exotic-runtime escape hatch; auto-detects `globalThis.WebSocket` or dynamically loads `ws` otherwise).

- `connect(): void` — opens the socket; safe to call once, `disconnect()` first to reconnect manually.
- `disconnect(): void` — closes and cancels any pending reconnect.
- `publish(channelId: string, payload: string): void` — chunks transparently above 211 bytes.
- `unicast(userId: string, payload: string): void` — same chunking; `userId` ≤24 UTF-8 bytes.
- `replay(channelId: string, sinceUnixSeconds?: number): void` — default `0` (all history).
- `subscribe(channelId: string, handler: MessageHandler): Unsubscribe` — exact channel or `orders:*` wildcard; multiple `subscribe()` calls on the same `channelId` share one underlying SUB frame; last handler removed on a channel → real UNSUB frame.
- `channel(channelId: string): ChannelHandle` — see §7's named-events section. `ChannelHandle.on<T>(event: string, handler: (data: T, message: RealtimeMessage) => void): Unsubscribe`; `ChannelHandle.emit(event: string, data?: unknown): void`.
- `on<K extends keyof RealtimeEvents>(event: K, listener): Unsubscribe` / `off(event, listener): void` — **connection lifecycle only**, not channel messages: `"open"` (`undefined`), `"close"` (`{code, reason}`), `"error"` (`Error`), `"authenticated"` (`undefined`, optimistic), `"authFailed"` (`{code, reason}`, fires right after `close` specifically when `code === 4001` — an invalid or expired token; without `getToken` configured, the client does **not** auto-reconnect after this one, even with `reconnect: true`, since retrying with the same token would just fail again — with `getToken` configured, it does reconnect, fetching a fresh token first), `"message"` (`RealtimeMessage`, fires for every frame before per-channel dispatch). Do not confuse this with `channel().on()` — different object, different purpose, see §7.

`RealtimeMessage`: `{ channelId: string, payload: string, tenantId?: string, receivedAt: number }` — `receivedAt` is a client-side `Date.now()` timestamp, **not** server-stamped (the wire frame carries no timestamp field at all).

Also exported: `isNotificationSupported()`, `requestNotificationPermission()`, `showBackgroundNotification(message, options)` (per-message, callable from any handler), `attachBackgroundNotifications(client, options)` (wired to the client's own `"message"` event, calls `showBackgroundNotification` internally), `registerPushServiceWorker(url)`, `subscribeToPush(registration, vapidPublicKey)`, `unsubscribeFromPush(subscription)` — see §9.

### React (`@mio/realtime-sdk-react`)

```bash
npm install @mio/realtime-sdk-react @mio/realtime-sdk
```
```jsx
import { RealtimeProvider, useChannel } from '@mio/realtime-sdk-react'

function App() {
  return (
    <RealtimeProvider config={{ wsUrl: wsUrlFromMintToken, tenantId: '<tenant-id>', token }}>
      <OrdersFeed />
    </RealtimeProvider>
  )
}
function OrdersFeed() {
  const { messages, publish } = useChannel('orders:42', { limit: 100 })
  return <button onClick={() => publish('order created')}>Publish</button>
}
```
**Full API**

- `<RealtimeProvider client?={RealtimeClient} config?={RealtimeClientConfig} autoConnect?={boolean /* default true */}>` — exactly one of `client`/`config` required. `client`: caller-owned, Provider connects/disconnects around its lifecycle but never constructs it. `config`: Provider builds+owns the client, calls `disconnect()` on unmount.
- `useRealtimeContext(): { client, connectionState, lastError }` — low-level; throws outside a Provider.
- `useRealtimeClient(): RealtimeClient` — just the client.
- `useConnectionState(): { connectionState: "idle"|"connecting"|"open"|"closed"|"error", lastError: Error | null }`.
- `useSubscription(channelId: string | null | undefined, handler: MessageHandler): void` — effect-only, never re-renders its own component; `handler` need not be stable between renders (kept in a ref); nullish `channelId` disables it.
- `useChannel(channelId, options?: { limit?: number /* default 50 */, replaySince?: number }): { messages: RealtimeMessage[], publish: (payload: string) => void, clear: () => void }` — accumulates messages in React state (re-renders per message), oldest evicted past `limit`; `clear()` empties the local buffer only, doesn't unsubscribe; if `replaySince` set, calls `replay()` on every (re)subscription and mixes replayed frames into `messages` indistinguishably from live ones.
- `usePublish(channelId: string): (payload: string) => void` — publish-only, no subscription.
- `<ChannelSubscriber channelId={...} {...options}>{(state) => ...}</ChannelSubscriber>` — render-prop wrapper over `useChannel`, no extra logic.
- `<ConnectionIndicator className?={string} labels?={Partial<Record<ConnectionState,string>>} />` — unstyled `<span>`, default label per state, overridable per-state.
- `useBackgroundNotifications(options?: BackgroundNotificationOptions): void` — wraps core `attachBackgroundNotifications`; `options` reference identity doesn't need to be stable.
- `usePushSubscription(serviceWorkerUrl: string, vapidPublicKey: string): { status: "idle"|"subscribing"|"subscribed"|"unsubscribing"|"error", subscription: PushSubscriptionInfo | null, error: Error | null, subscribe: () => Promise<PushSubscriptionInfo | null>, unsubscribe: () => Promise<void>, isSupported: boolean }` — does **not** POST anywhere itself; caller sends the resolved `{endpoint, keys}` to their own backend (`POST /api/v1/push/subscriptions`).

Re-exports `RealtimeClient` class + core types so consumers don't need a separate `@mio/realtime-sdk` import alongside these hooks.

### React Native (`@mio/realtime-sdk-react-native`)

Re-exports everything from `@mio/realtime-sdk-react` **except**
`useBackgroundNotifications`/`usePushSubscription` (browser-only
`Notification`/`PushManager` APIs don't exist in RN — use
`@react-native-firebase/messaging` instead) — every other hook/component
listed above is identical, same import surface, just from
`@mio/realtime-sdk-react-native`.

**`<RealtimeProvider>` here is a replacement, not a re-export** — same
props signature, but internally wraps an `AppStateReconnector` (not
itself exported): on background, it explicitly calls `client.disconnect()`
rather than letting the OS silently kill the socket (avoids burning the
reconnect backoff budget on attempts with no foregrounded JS to receive
them); on foreground, it calls `client.connect()` itself. Rationale: RN
can fully suspend JS execution in the background, so the core client's
own in-JS backoff timer would never fire there anyway.

`useNetworkReconnect(): void` — separate opt-in hook, must be used under
a `<RealtimeProvider>`. Dynamically imports `@react-native-community/netinfo`
(an **optional** peer dependency, not bundled) — silently becomes a
no-op if it isn't installed, rather than crashing. When present, calls
`client.connect()` on a `false→true` network-connectivity transition.

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

**Full API**

`ClientConfig` (dataclass): `url: str`; `tenant_id: UUID`; `token: str`; `heartbeat_interval: float = 15.0`; `reconnect: bool = True`; `reconnect_base_delay: float = 0.5`; `reconnect_max_delay: float = 15.0`.

- `async connect() -> None` — starts the background connection task. Does not itself await the socket actually opening — no "connected" future is exposed.
- `async disconnect() -> None` — cancels heartbeat/connection tasks, closes the socket, disables any pending reconnect.
- `async __aenter__()` / `__aexit__()` — `async with RealtimeClient(config) as client:` sugar for `connect()`/`disconnect()`.
- `subscribe(channel_id: str, handler: MessageHandler) -> Unsubscribe` — **sync**, not async, despite the client being asyncio-based; exact channel or `*` wildcard. Last handler removed for a channel schedules a real UNSUB frame via `asyncio.create_task`.
- `async publish(channel_id: str, payload: str) -> None`.
- `async unicast(user_id: str, payload: str) -> None` — silently truncates >211 bytes, see §8's matrix.
- `async replay(channel_id: str, since_unix_secs: int = 0) -> None`.
- No event/callback API for connection lifecycle (unlike TypeScript's `on()` or the WordPress clients' `.on()`) — on an auth failure (close code `4001`), this SDK logs `logger.error(...)` and stops the reconnect loop rather than retrying with the same dead token, but there's nothing to subscribe to from application code today.

`RealtimeMessage` (frozen dataclass): `channel_id: str`, `payload: str`, `tenant_id: UUID`. Type aliases: `MessageHandler = Callable[[RealtimeMessage], None]`, `Unsubscribe = Callable[[], None]`.

`realtime_sdk.protocol` (pure stdlib, usable without `websockets` installed): `Opcode` (IntEnum, same 9 values as everywhere else), `encode_frame(opcode, tenant_id, channel_id="", payload="") -> bytes`, `decode_frame(data: bytes) -> DecodedFrame` (raises `ProtocolError`), `crc16_ccitt_false(data: bytes) -> int`, `glob_match(pattern: str, candidate: str) -> bool`.

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

**Full API**

`ClientConfig` (struct, `Default`): `url: String = ""`; `tenant_id: Uuid = Uuid::nil()`; `token: String = ""`; `heartbeat_interval: Duration = 15s`; `reconnect: bool = true`; `reconnect_base_delay: Duration = 500ms`; `reconnect_max_delay: Duration = 15s`.

- `RealtimeClient::connect(config: ClientConfig) -> Self` — **associated fn, not a method**; spawns the background task and returns immediately (non-blocking, may still be retrying).
- `publish(&self, channel_id: &str, payload: &str) -> Result<(), ClientError>`.
- `unicast(&self, user_id: &str, payload: &str) -> Result<(), ClientError>` — silently truncates >211 bytes, see §8's matrix.
- `replay(&self, channel_id: &str, since_unix_secs: u64) -> Result<(), ClientError>`.
- `subscribe(&self, channel_id: impl Into<String>) -> broadcast::Receiver<RealtimeMessage>` — multiple calls on the same `channel_id` share one internal `tokio::sync::broadcast` bus, capacity 256; a lagging receiver gets `RecvError::Lagged` rather than unbounded growth.
- `unsubscribe(&self, channel_id: &str) -> Result<(), ClientError>` — **not per-`Receiver`**: kills the shared bus for that channel entirely (every outstanding `Receiver` for it gets `RecvError::Closed`) and sends a real UNSUB frame. This is the one SDK where unsubscribe isn't scoped to a single handler — `broadcast::Receiver` has no "last subscriber dropped" hook to hang that off of.
- `disconnect(self)` — consumes `self`, aborts the background task. **No graceful WS close handshake is sent** (documented simplification). `impl Drop` aborts the task too, as a safety net if `disconnect()` is never called.

`ClientError`: `NotConnected` (the background task's command channel closed).
`RealtimeMessage` (`Debug, Clone, PartialEq, Eq`): `channel_id: String`, `payload: String`, `tenant_id: Uuid`.

`realtime_sdk::{Opcode, ProtocolError, FrameFields, encode_frame, decode_frame, crc16_ccitt_false, glob_match}` re-exported from `protocol.rs` — `DecodedFrame` here owns its `String` fields (not zero-copy like the server's), a deliberate API-simplicity tradeoff.

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

**Full API**

**No separate Java-facing class exists** — one Kotlin file made
Java-friendly via `@JvmOverloads`, `fun interface` (SAM) callbacks, and
`AutoCloseable` (works with try-with-resources), rather than exposing
coroutines in the public API. Confirmed identical usage from both
`examples/JavaUsage.java` and `examples/KotlinUsage.kt`.

`RealtimeClientConfig` (data class, `@JvmOverloads` constructor): `url: String`; `tenantId: UUID`; exactly one of `token: String?` (static, default `null`) or `tokenProvider: TokenProvider?` (default `null`) — enforced by an `init` block (`IllegalArgumentException` if both or neither), not the type system (Kotlin has no discriminated unions); `heartbeatIntervalMs: Long = 15_000`; `reconnect: Boolean = true`; `reconnectBaseDelayMs: Long = 500`; `reconnectMaxDelayMs: Long = 15_000`; `okHttpClient: OkHttpClient = OkHttpClient()` (pass your own if your app already configures interceptors/timeouts/cert pinning).

`TokenProvider` (`fun interface`, usable as a Kotlin/Java lambda): `fun getToken(): TokenRefreshResult`, called synchronously on the client's own background `ScheduledExecutorService` thread (safe to block on your backend's HTTP call there — never the caller's thread, `connect()` itself dispatches onto that same executor precisely so a slow `tokenProvider` can't ANR an Android UI thread) before *every* connection attempt: the first `connect()`, and automatically on every reconnect, including right after `ConnectionEvent.AuthFailed`. A thrown exception is treated like any other connection failure (`ConnectionEvent.Error`, reconnect rescheduled with the normal backoff). `TokenRefreshResult(token: String, wsUrl: String? = null)` — `wsUrl` omitted reuses the one already configured.

- `connect()` / `disconnect()` — the latter closes with standard WS code `1000`, cancels heartbeat, disables auto-reconnect.
- `onConnectionEvent(listener: ConnectionListener): AutoCloseable` — `ConnectionEvent` sealed class: `Open`, `Closed(code: Int, reason: String)`, `Error(throwable: Throwable)`, `Authenticated` (optimistic — no AUTH ack, see §1.6), `AuthFailed(code: Int, reason: String)` (fires right after `Closed` specifically when `code == 4001` — an invalid or expired token; without `tokenProvider` configured, the client does **not** auto-reconnect after this one, even with `reconnect = true` — with `tokenProvider` configured, it does, fetching a fresh token first).
- `subscribe(channelId: String, listener: MessageListener): AutoCloseable` — exact or `*` wildcard; `.close()` (or Kotlin `.use { }`) sends a real UNSUB once the last listener for that channel is gone.
- `publish(channelId: String, payload: String)`.
- `unicast(userId: String, payload: String)` — silently truncates >211 bytes, see §8's matrix.
- `replay(channelId: String, sinceUnixSeconds: Long = 0)` — `@JvmOverloads` gives Java a zero-arg-suffix overload too.

`fun interface MessageListener { fun onMessage(message: RealtimeMessage) }`, `fun interface ConnectionListener { fun onEvent(event: ConnectionEvent) }` — both SAM, usable as a lambda from Kotlin or Java. `RealtimeMessage` (data class): `channelId: String`, `payload: String`, `tenantId: UUID`.

Heartbeat runs on a daemon `ScheduledExecutorService` (`"realtime-sdk-scheduler"`), not coroutines. `Protocol.kt`: `Opcode` enum with `fromByte(value: Int): Opcode?`, `encodeFrame(opcode, tenantId, channelId = "", payload = "")` (`@JvmOverloads`), `decodeFrame(data: ByteArray): DecodedFrame` (throws `ProtocolException`), `crc16CcittFalse(...)`, `globMatch(...)`.

### WordPress (PHP `Mio\Realtime\Client`, no persistent connection)

```bash
composer require mio/realtime-wordpress
```
```php
use Mio\Realtime\Client;
$client = new Client('https://realtime.example.com:8090', '<tenant-id>', $secret);
$minted = $client->mintToken('user-42'); // MintedToken { token, expiresIn, wsUrl }
$client->publish('orders:42', 'order created', $minted->token);
$client->emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);
```
No chunking on `publish()`/`emitEvent()` — 211-byte cap, throws before
any network call if exceeded. Never let `$secret` leave PHP. Also
ships `[mio_realtime channel="..."]` shortcode and standalone
`mio-embed.js`/`mio-protocol.js`/`mio-client.js` (dependency-free
`<script>` tags, no PHP/build step — hosted via jsDelivr:
`https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.8/sdk-wordpress/assets/js/mio-embed.min.js`,
pin the tag, never `@master`).

**Full API — `Mio\Realtime\Client`**

Constructor: `new Client(string $apiUrl, string $tenantId, string $secret, ?HttpTransport $transport = null)` — `$transport` defaults to `WpHttpTransport` (needs WordPress loaded); inject your own (e.g. `LaravelHttpTransport`, or a test double) to use `Client` outside WordPress entirely — it calls zero WordPress functions itself.

- `mintToken(string $sub, ?int $ttlSecs = null): MintedToken` — `MintedToken { public readonly string $token; public readonly int $expiresIn; public readonly string $wsUrl; }`. `$ttlSecs` omitted uses the server's own default (3600s). `$wsUrl` is server-derived (§1 rule 8) — never assembled from a host/port yourself.
- `publish(string $channelId, string $payload, string $token): bool` — throws `ClientException` (never a network call) if `$channelId` >24 bytes or `$payload` >211 UTF-8 bytes.
- `emitEvent(string $channelId, string $event, string $token, mixed $data = null): bool` — `publish()` with a JSON `{event, data}` payload; `$data === null` omits the `data` key entirely from the JSON rather than emitting `null`.
- `ClientException`: `getMessage(): string`, `getErrorCode(): string`, `getHttpStatus(): ?int` (null for a purely local validation failure, e.g. oversized payload, since no request was ever sent).

**`mio-client.js`/`mio-embed.js` (browser, no PHP, deliberately minimal — no unicast, no wildcard, no chunking, no `channel()`/events):**
`new MioRealtimeClient({wsUrl, tenantId, token, heartbeatIntervalMs?, reconnect?, reconnectBaseDelayMs?, reconnectMaxDelayMs?})` — `wsUrl` is the `ws_url` from mint-token, passed through as-is (no `host`/`port`/`secure` config exists here, see §1 rule 8). `.connect()`, `.disconnect()`, `.subscribe(channelId, handler) -> unsubscribe fn`, `.publish(channelId, payload)`, `.replay(channelId, sinceUnixSeconds)` — the last two queue and send once, in call order, if invoked before the socket is actually open (e.g. right after `connect()`), rather than throwing. `mio-embed.js` additionally auto-inits from its own `<script>` tag's `data-*` attributes (`data-ws-url`, `data-tenant-id`, `data-token`, `data-channel`, `data-replay`, `data-target` — a CSS selector for where to render the auto-built feed) and exposes the instance at `window.MioEmbed.client`. `.on('authFailed', handler)` fires `{code: 4001, reason}` when the server rejects AUTH (invalid/expired token) — same close-code detection as the TypeScript SDK, and the client likewise never auto-reconnects after this specific close, even with `reconnect: true`.

Static, on the constructor itself (`MioRealtimeClient.*` / `MioEmbedClient.*`, same on both files): `isNotificationSupported(): boolean`, `requestNotificationPermission(): Promise<string>` (call from a click), `showBackgroundNotification(message, options?): void` — shows one notification for `message`, callable directly from any handler (e.g. a `subscribe()` callback) for per-channel control, and `attachBackgroundNotifications(client, options?): () => void` — the same logic wired to the client's own `'message'` event instead, covering every subscribed channel at once. Native `Notification` API only, tab hidden/unfocused, no server setup; mirrors `@mio/realtime-sdk`'s `showBackgroundNotification`/`attachBackgroundNotifications` (§9), ported to this file's zero-dependency constraints. `options`: `filter?`, `title?`, `body?`, `icon?`, `onClick?`, same shape as the TypeScript SDK's `BackgroundNotificationOptions`.

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

**Full API**

`MioRealtime` facade forwards every call to the container-bound
`Mio\Realtime\Client` singleton via Laravel's standard `__callStatic`
magic — so it has **exactly** `Client`'s method list from the WordPress
section above (`mintToken`, `publish`, `emitEvent`, same signatures, no
Laravel-specific renaming or wrapping). `MioRealtimeServiceProvider`
binds `Client::class` from config keys `mio-realtime.api_url`/`.tenant_id`/`.secret`
(env vars `MIO_REALTIME_API_URL`/`MIO_REALTIME_TENANT_ID`/`MIO_REALTIME_SECRET`),
using `LaravelHttpTransport` (constructor-injected `Illuminate\Http\Client\Factory`,
in place of `WpHttpTransport`'s `wp_remote_post`) — nothing WordPress-specific
ever loads.

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
| `backend/` | Compiled, tested (96/98 passing, 2 ignored live-Redis integration tests), deployed to production |
| `sdk-typescript` | Compiled + tested (34/34), includes `channel()` |
| `sdk-react` / `sdk-react-native` | Compiled (`tsc` strict), hooks not runtime-tested against a live server |
| `sdk-wordpress` | PHP `Client` tested (12/12 PHPUnit); JS codec/client tested (44/44); WordPress integration itself (routes, shortcode, settings page) untested against a real WordPress install |
| `sdk-laravel` | `LaravelHttpTransport` tested (3/3); service provider/facade untested against a real app |
| `sdk-python` | Protocol codec tested (13/13); `client.py` (network) untested |
| `sdk-rust` | Written, not compiled by its authors |
| `sdk-android` | Written, not compiled by its authors |

When generating code for the last three rows, say so explicitly rather
than presenting it as verified — these are honest first drafts, not
validated artifacts.
