# web-client

React + Vite + TailwindCSS + shadcn/ui client for the realtime-engine
backend (`backend/`) — a mobile-responsive chat app with cross-channel
notifications, built on `sdk-typescript`. Follows the layered structure
in the repo root's `FRONTEND.md`.

## Status

Written and locally run against `backend/`'s docker-compose stack
(`engine-a` at `ws://localhost:8080/ws`); not yet covered by automated
tests (see `FRONTEND.md` §14 for the intended testing layout).

## Quick start

```bash
npm install
cp .env.example .env   # optional — defaults already point at engine-a
npm run dev
```

The backend has no public token-issuance endpoint (only the internal
Admin API manages tenants) — for local testing against the demo tenant
docker-compose registers, mint a token with:

```bash
node scripts/mint-token.mjs alice   # prints a token for tenant 00000000-0000-0000-0000-000000000001
```

Paste the printed token into the connect screen along with:
- WebSocket URL: `ws://localhost:8080/ws` (`engine-a`) or `ws://localhost:8081/ws` (`engine-b`)
- Tenant ID: `00000000-0000-0000-0000-000000000001`
- Display name: anything

Open the app in two browser tabs — one against `engine-a`, one against
`engine-b` — join the same channel in both, and send a message: it
should arrive on both, proving the Redis-backed multi-instance broadcast
docker-compose.yml exists to validate.

## Mobile

`vite.config.ts` sets `server.host: true`, so `npm run dev` is also
reachable from a phone on the same network at `http://<your-lan-ip>:5173`.
The layout is responsive by design (see `AppLayout.tsx`): the sidebar
collapses into a drawer below the `md` breakpoint.

## Chat protocol note

The wire protocol (`RealtimeMessage`) carries only a channel + raw text
payload, no sender identity. This app layers a small `{from, text}` JSON
envelope over that payload (`src/actions/chat/chatEnvelope.action.ts`) so
messages can show a sender name — a client-side convention, not a backend
change. Plain-text payloads from other clients still render as anonymous
messages.
