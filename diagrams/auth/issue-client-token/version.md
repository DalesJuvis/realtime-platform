# Sequence — Issue client token (`POST /api/v1/auth/tokens`)

Context: `backend/src/modules/auth` — `IssueClientTokenController` →
`IssueClientTokenUseCase` → `WsUrlService::derive_ws_url`. Called by a
tenant's own backend, authenticated with the tenant secret (never a
browser/mobile app — see `routes.rs`'s own security note: this endpoint is
unauthenticated at the HTTP-guard level, the request body's `secret` *is*
the authentication).

## Before — client had to know host/port/secure itself

```
  Tenant backend        Auth API              End-user's SDK        mio WS
  (holds secret)      /api/v1/auth/tokens      (browser/app)        (:8080)
        |                     |                       |                 |
        |--POST {tenant_id,-->|                       |                 |
        |  secret, sub}       |  verify secret,        |                 |
        |                     |  sign token             |                 |
        |<--{token,           |                       |                 |
        |    expires_in}------|                       |                 |
        |                     |                       |                 |
        |--hand token to end user (out of band)------->|                 |
        |                     |                       |                 |
        |                     |         SDK config: { host, port: 8080, |
        |                     |           secure, path, tenantId, token }|
        |                     |                       |                 |
        |                     |                       |--wss://host-----|
        |                     |                       |  :8080/ws  ---->|
        |                     |                       |    (WRONG in    |
        |                     |                       |  prod: real URL |
        |                     |                       |  is wss://host  |
        |                     |                       |  /ws, no port)  |X
        |                     |                       |                 |
```

Problem: the SDK has to guess/be told host+port+secure+path — and the
"default port 8080" baked into every SDK is only correct talking to the
engine directly, never true in production behind Caddy (`Caddyfile`
proxies both `/api/*` and `/ws` under the SAME public `{$DOMAIN}`, no port).

## After — server derives and returns the exact URL

```
  Tenant backend        Auth API                              End-user's SDK       mio WS
  (holds secret)      /api/v1/auth/tokens                     (browser/app)   (behind Caddy, /ws)
        |                     |                                      |                 |
        |--POST {tenant_id,-->|                                      |                 |
        |  secret, sub}       |                                      |                 |
        |                     |--verify secret (any active key)---->|                 |
        |                     |                                      |                 |
        |                     |--derive_ws_url(headers, override)--\|                 |
        |                     |   1. PUBLIC_WS_URL env set? -> use it, done.           |
        |                     |   2. else: scheme = X-Forwarded-Proto == "https"       |
        |                     |            ? "wss" : "ws"                              |
        |                     |      host = this request's own Host header             |
        |                     |      ws_url = "{scheme}://{host}/ws"                   |
        |                     |<-------------------------------------/                 |
        |                     |                                      |                 |
        |                     |--sign token------------------------>|                 |
        |<--{token,           |                                      |                 |
        |    expires_in,      |                                      |                 |
        |    ws_url}----------|                                      |                 |
        |                     |                                      |                 |
        |--hand token + ws_url to end user (out of band)------------>|                 |
        |                     |                                      |                 |
        |                     |         SDK config: { wsUrl, tenantId, token } — |     |
        |                     |         no host/port/secure/path, ever            |     |
        |                     |                                      |                 |
        |                     |                                      |--connect(wsUrl)-|
        |                     |                                      |  wss://host/ws  |
        |                     |                                      |  (correct: same |
        |                     |                                      |   domain as the |
        |                     |                                      |   API call, no  |
        |                     |                                      |   port)         |
```

Two derivation paths, chosen by `Settings::public_ws_url` (env
`PUBLIC_WS_URL`):

- **Unset (production default):** derived from this request's own `Host` +
  `X-Forwarded-Proto` headers. Correct with zero config behind Caddy,
  because `Caddyfile` proxies `/api/*` and `/ws` under the exact same site
  block/domain.
- **Set (local dev / split-port topologies):** used verbatim, no header
  inspection. Needed wherever Portal API and WS genuinely live on
  different ports with no reverse proxy unifying them — see
  `backend/docker-compose.yml`'s two-instance demo, which sets it
  explicitly per instance (`ws://localhost:8080/ws`, `ws://localhost:8081/ws`).

Deliberately **not** applied to the Admin API's own mint-token endpoint
(`backend/src/modules/admin`) — see `diagrams/admin/` if that use case
grows a diagram of its own — because it's reached over an SSH tunnel,
where header-derivation would produce a wrong URL.
