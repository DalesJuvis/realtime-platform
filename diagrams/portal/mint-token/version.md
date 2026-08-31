# Sequence — Mint token from tenant-portal (`POST /api/v1/portal/tokens`)

Context: `backend/src/modules/portal` — `MintTokenController` →
`MintClientTokenUseCase` → the same `WsUrlService::derive_ws_url` used by
`auth`'s issue-token flow (see
[`diagrams/auth/issue-client-token/version.md`](../../auth/issue-client-token/version.md)
for the derivation logic itself). Different actor and auth model from that
flow: here the caller is a human logged into `tenant-portal` (session
cookie, `PORTAL_SESSION_SECRET`), minting a token for themselves to test
with — e.g. Overview's or API Keys' "Mint token" button
(`MintTokenCard.tsx`) — not a tenant's own backend proving it holds the
tenant secret.

## Before — tenant-portal assembled the WS URL itself

```
  tenant-portal UI      Portal API                                 tenant-portal
  (logged-in user)   /api/v1/portal/tokens                        (same browser)
        |                     |                                          |
        |--POST (session----->|                                          |
        |  cookie only,       |  mint token for this tenant               |
        |  no body needed)    |                                          |
        |<--{token,           |                                          |
        |    expires_in}------|                                          |
        |                     |                                          |
        |--credentialsFile.ts assembles a downloadable .env/JSON:-------->|
        |     connection: { host: deriveWsHost(apiUrl), port: 8080,      |
        |                    secure: apiUrl.protocol === "https:" }      |
        |                     |                                          |
        |                     |          (WRONG in production: hardcoded |
        |                     |           port 8080, no reverse proxy    |
        |                     |           serves WS there)               |X
```

## After — server derives and returns the exact URL

```
  tenant-portal UI      Portal API                                 tenant-portal
  (logged-in user)   /api/v1/portal/tokens                        (same browser)
        |                     |                                          |
        |--POST (session----->|                                          |
        |  cookie only)       |                                          |
        |                     |--derive_ws_url(headers, ctx.public_ws_url)
        |                     |   same two-path logic as the auth flow:  |
        |                     |   PUBLIC_WS_URL override, else this      |
        |                     |   request's own Host + X-Forwarded-Proto |
        |                     |<------------------------------------ ---|
        |                     |                                          |
        |                     |--sign token----------------------------->|
        |<--{token,           |                                          |
        |    expires_in,      |                                          |
        |    ws_url}----------|                                          |
        |                     |                                          |
        |--MintTokenCard.tsx: setCredentials({ token, wsUrl,------------->|
        |    expiresIn, tenantId })                                      |
        |                     |                                          |
        |                     |    credentialsFile.ts now writes         |
        |                     |    `ws_url: creds.wsUrl` verbatim into   |
        |                     |    the downloadable file — no host/port/ |
        |                     |    secure assembly left in tenant-portal |
        |                     |    at all.                               |
```

Same derivation rule as the `auth` module's flow — see that diagram for
the `PUBLIC_WS_URL` override vs. header-derivation decision tree. The two
controllers call the identical `WsUrlService::derive_ws_url`, just from
different HTTP contexts (session-authenticated portal request vs.
secret-authenticated tenant-backend request).
