# tenant-portal

Self-service portal for a **tenant** of the realtime-engine backend —
email/password login, live "devices" (connected sessions), and
server-side client-token minting. Separate from `admin/` (the
platform-operator tool): a tenant sees only their own account, never
another tenant's.

## What's real here

Every number on this dashboard comes from the backend's actual state —
`modules::portal` in `backend/src/modules/portal/`:

- **Devices** — `PresenceService`'s live WS/TCP session tracking, not a
  simulated device list.
- **Overview** — active session count (same source) plus a sum of this
  tenant's own labeled Prometheus counters, scoped server-side so one
  tenant's dashboard can never see another's traffic.
- **Client token** — mints a real signed token via `TokenService`,
  server-side, so your tenant secret never has to be pasted into a
  browser again after registration.

## Auth

There's no "forgot password" or admin-provisioned account — registration
proves you own the tenant by requiring its real secret (the one the
platform admin got back once from `POST /api/v1/admin/tenants`). From
then on it's a normal email/password login, backed by a persistent
SQLite store on the backend (`PORTAL_DB_PATH`) — the one piece of durable
state in an otherwise in-memory backend.

## Getting started

```bash
npm install
cp .env.example .env   # points at engine-a's portal port by default
npm run dev
```

Requires the backend running (`docker compose up` from `backend/`) and a
tenant already created via the `admin/` app (or docker-compose's
`DEMO_TENANT_SECRET`: tenant `00000000-0000-0000-0000-000000000001`,
secret `dev-secret-change-me`).
