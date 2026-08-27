# Realtime Admin

Admin panel for the `backend/` realtime engine's Admin API — tenant
management and live instance metrics. Built with React 19, Vite, TypeScript
(strict), react-router-dom, Zustand, TailwindCSS, and hand-written
shadcn/ui-style components, per the repo root's `FRONTEND.md` conventions.

## Status

Adapted from an unrelated payments-admin scaffold that landed in this repo
by mistake — every page now maps to something the real backend actually
exposes (`backend/src/modules/admin/routes.rs`), and everything that didn't
(checkout, payouts, refunds, subscriptions, API keys, team/roles, tenant
self-login, audit logs, ...) was removed. Verified end-to-end against a
running `docker compose` stack: connect, create a tenant, mint a client
token, edit rate limits, revoke.

## What this backend's Admin API actually supports

- **No login endpoint.** `AdminTokenGuard` checks a single static bearer
  token (`ADMIN_API_TOKEN`) — same token for every caller, valid against
  exactly one engine instance's admin port. The "Connect" screen just asks
  for that URL + token; nothing is verified until the first real call.
- **No tenant listing.** Tenant secrets live in an in-memory
  `TenantSecretRepository`, per instance, with nothing durable to list —
  only create/revoke/rotate-secret/set-limits exist. This app keeps its own
  local registry of tenants it's created or been told about
  (`tenants.store.ts`) purely so there's something to act on; it is not a
  live view of server state.
- **Two instances, two registries.** `docker-compose.yml` runs `engine-a`
  and `engine-b` with independent admin ports (9090/9091) and independent
  in-memory tenant state — creating a tenant on one does not register it on
  the other.
- **Live metrics, no history.** `/api/v1/system/metrics` is a Prometheus
  scrape endpoint — the Dashboard polls and parses it every 5s. There's no
  time-series store here, so it's current-value-only, not a chart.

## Getting started

```bash
npm install
cp .env.example .env   # points at engine-a's admin port by default
npm run dev
```

Requires the backend running — `docker compose up` from `backend/`, or
`cargo run` directly. Connect with:

- Admin API URL: `http://localhost:9090` (`engine-a`) or `:9091` (`engine-b`)
- Admin token: `docker-compose.yml`'s `ADMIN_API_TOKEN` (`dev-admin-token-change-me` by default)

## Scripts

| Command              | Purpose                                      |
|-----------------------|-----------------------------------------------|
| `npm run dev`         | Start the Vite dev server                     |
| `npm run build`       | Type-check (`tsc -b`) then production build   |
| `npm test`            | Run the Vitest suite once                     |
| `npm run test:watch`  | Run Vitest in watch mode                      |
| `npm run lint`        | Run oxlint                                    |
| `npm run preview`     | Preview the production build locally          |
