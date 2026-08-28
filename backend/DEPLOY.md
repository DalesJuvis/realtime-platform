# Deploying to a VPS (Docker)

Single-instance production deployment: the engine + Caddy (TLS termination,
reverse proxy) via `docker-compose.prod.yml`. Written for a fresh Ubuntu/
Debian VPS (Hostinger or otherwise) with Docker already installed — if
Docker isn't installed yet, see "Prerequisites" below.

Scope: **backend only** (WS/TCP/Admin/Portal APIs). The frontend apps
(`tenant-portal/`, `admin/`, `web-client/`) aren't part of this compose
file — build/host them separately, pointed at this VPS's URLs (see
"Pointing the frontend apps at this deployment" at the bottom).

## Prerequisites

```bash
# Docker + the compose plugin, if not already present:
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in once after this
docker compose version           # sanity check — should print a v2.x version
```

## 1. Get the code onto the VPS

```bash
git clone https://github.com/DalesJuvis/realtime-platform.git
cd realtime-platform/backend
```

## 2. Firewall

Only Caddy's ports (80/443) and raw TCP (7878, if you actually use
non-browser TCP clients) need to be reachable from the internet. The
Admin API (9090) is bound to `127.0.0.1` in `docker-compose.prod.yml` —
it's never exposed regardless of the firewall, reached only via an SSH
tunnel (see "Admin access" below).

```bash
sudo ufw allow 22/tcp    # keep your SSH session alive
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7878/tcp  # skip this if you don't need raw TCP clients
sudo ufw enable
```

## 3. Secrets

```bash
cp .env.production.example .env
```

Generate the two required secrets and paste them into `.env`:

```bash
openssl rand -hex 32   # -> ADMIN_API_TOKEN
openssl rand -hex 32   # -> PORTAL_SESSION_SECRET
```

Set `DOMAIN` in `.env`:
- Domain already pointed at this VPS's IP (an A record)? `DOMAIN=realtime.example.com`
- IP only, no domain yet? Leave `DOMAIN=:80`.

Leave `DEMO_TENANT_SECRET` commented out — real tenants self-serve via
`tenant-portal`'s signup flow (`POST /api/v1/portal/auth/signup`), no
value in pre-seeding a demo one on a real deployment.

### Optional: Web Push keys

Only needed if you want browser push notifications (see
`src/modules/push/services/WebPushCrypto.rs`). Generates a real VAPID
keypair using this project's own `examples/generate_vapid_keys.rs`,
built from the same `builder` stage the production image itself uses (a
few minutes — full Rust dependency compile, cached after the first run):

```bash
docker build --target builder -t mio-builder .
docker run --rm mio-builder sh -c \
  "cd /build && cargo run --release --example generate_vapid_keys"
```

Paste the three printed `VAPID_*` lines into `.env`, uncommented.

## 4. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes a few minutes (same musl release build as the local
dev compose file). Watch it come up:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Look for `WebSocket server listening on 0.0.0.0:8080`, `Portal API
listening on 0.0.0.0:8090`, and (once DNS/HTTP-01 succeeds, if using a
real domain) Caddy logging a certificate obtained for `DOMAIN`.

## 5. Verify

```bash
# Portal API, through Caddy:
curl -i https://your-domain/api/v1/portal/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test@example.com","password":"correct horse battery staple"}'
# -> {"success":true,"data":{...}} means the whole chain (Caddy -> engine -> SQLite) works.

# WebSocket, through Caddy (wss://) — needs a client, curl can't upgrade a
# WS connection meaningfully here; the browser apps are the real test
# (see the bottom section), or use `wscat -c wss://your-domain/ws`.
```

If `DOMAIN` is a real domain and this is the first request, expect a
short delay while Caddy completes the ACME/Let's Encrypt handshake.

## Admin access

The Admin API stays on `127.0.0.1:9090` only (see `docker-compose.prod.yml`'s
header comment for why — the code itself has warned about this since
before this deployment config existed). Reach it via an SSH tunnel:

```bash
ssh -L 9090:localhost:9090 user@your-vps-ip
```

Then point a locally-run `admin/` app at `http://localhost:9090` while
the tunnel is open.

## Updating

```bash
cd realtime-platform && git pull
cd backend && docker compose -f docker-compose.prod.yml up -d --build
```

The named volume `portal-data` (SQLite — tenants, users, channels,
templates, push subscriptions) persists across this; nothing in it is
touched by a rebuild.

## Backup

```bash
docker run --rm -v backend_portal-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/portal-data-$(date +%F).tar.gz -C /data .
```

(Volume name may be prefixed differently, e.g. `realtime-platform_portal-data`
— check `docker volume ls` if the above doesn't match.)

## Scaling to more than one instance

Not covered by `docker-compose.prod.yml` (deliberately kept to one
instance — see its header comment). When you actually need more than one
box: add a `service-cache` (Redis) and a second `service-messengio-b`
following the pattern in `docker-compose.yml` (the local dev file), set
`REDIS_URL` on both instances, and extend the Caddyfile to load-balance
between them (`reverse_proxy /ws* service-messengio-a:8080 service-messengio-b:8080`
— Caddy round-robins a list of upstreams by default).

## Pointing the frontend apps at this deployment

`tenant-portal/`, `admin/`, and `web-client/` each read their backend URL
from Vite env vars at *build* time (not runtime, see each app's
`src/lib/env.ts`) — set these before running `npm run build` for
whichever app(s) you host:

| App | Variable | Value |
|---|---|---|
| `tenant-portal/` | `VITE_API_URL` | `https://your-domain` (Portal API, proxied by Caddy) |
| `admin/` | `VITE_API_URL` | Leave as the default (`http://localhost:9090`) — the Admin API is tunnel-only in this deployment (see "Admin access" above), never `https://your-domain`; run `admin/` locally with the SSH tunnel open. |
| `web-client/` | `VITE_DEFAULT_WS_URL` | `wss://your-domain/ws` |
| `web-client/` | `VITE_VAPID_PUBLIC_KEY` | The `VAPID_PUBLIC_KEY` from `.env` above, if you set up Web Push — enables `PushNotificationToggle` in the UI. |
