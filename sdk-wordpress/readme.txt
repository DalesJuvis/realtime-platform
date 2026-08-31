=== mio Realtime ===
Contributors: mio
Tags: realtime, websocket, notifications, live-feed, pubsub
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.1.3
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connect your WordPress site to a mio realtime-platform tenant: mint client tokens and publish messages from PHP, and show a live-updating feed on any page with a shortcode.

== Description ==

This plugin bridges WordPress to a mio realtime-platform tenant (the
multi-tenant pub/sub engine at the root of this repository):

* **Server-side (PHP):** `Mio\Realtime\Client` mints signed client tokens
  and publishes messages over HTTP — call it from any WordPress hook
  (`save_post`, a WooCommerce order action, a cron job, ...). Your
  tenant secret stays in PHP; it is never sent to a visitor's browser.
* **Browser-side (JavaScript):** the `[mio_realtime channel="orders:42"]`
  shortcode renders a live-updating feed backed by a real WebSocket
  connection to the engine — no page reloads, no polling.

This is not a persistent-connection server SDK the way the project's
TypeScript/Python/Rust/Android SDKs are: a typical WordPress request
starts and ends PHP (mod_php/PHP-FPM), so there's no long-lived process
to hold a socket open in between requests. The plugin embraces that
instead of fighting it — PHP does the two things that fit a request/
response lifecycle (mint a token, publish one message), and the actual
live connection happens where a persistent connection makes sense: the
visitor's own browser.

= Requirements =

A running mio realtime-platform backend (Portal API + WebSocket server)
and a tenant ID/secret for it — see the main project's `tenant-portal/`
app to self-serve one, or your platform operator.

== Installation ==

1. Upload this directory to `/wp-content/plugins/mio-realtime`, or install
   the zip through the WordPress admin.
2. Activate the plugin.
3. Go to **Settings > mio Realtime** and fill in your Portal API URL,
   tenant ID, and tenant secret. No WebSocket host/port to configure —
   the backend derives that itself for every minted token.
4. Add `[mio_realtime channel="your-channel"]` to any page or post.

== Frequently Asked Questions ==

= Does this work for anonymous visitors? =

Yes — the `[mio_realtime]` shortcode's token endpoint
(`/wp-json/mio/v1/token`) is intentionally public, the same way the
underlying channel itself has no per-visitor access control on the
backend. Tokens it mints are short-lived (1 hour) and scoped to reading/
publishing on your tenant, never to your tenant secret.

= Can I publish messages from PHP (not just show a feed)? =

Yes — `Mio\Realtime\Client::publish($channelId, $payload, $token)`. Mint a
token first with `mintToken()`, or reuse one you already have.

= Does it support large messages? =

Not through this plugin's HTTP publish path or the lightweight browser
client — both cap a single message at 211 UTF-8 bytes (the underlying
protocol's one-frame limit; the platform's full SDKs support transparent
chunking for larger payloads, this lightweight plugin does not).

== Changelog ==

= 0.1.3 =
* Fixes a real bug: `replay()` (`data-replay="true"` on `mio-embed.js`, or
  the `[mio_realtime ... replay="true"]` shortcode) threw
  `"cannot send, WebSocket is not open"` when called right after
  `connect()` — which autoInit always does — because the socket is still
  connecting at that exact point, asynchronously. `replay()` now defers
  to the socket actually opening instead of sending immediately, the same
  way `subscribe()` already did. No config or markup changes needed —
  just update the CDN tag to `@v0.1.3` (jsDelivr caches each tag's
  content forever, so `@v0.1.2` will keep serving the broken build).

= 0.1.2 =
* **Breaking:** the WebSocket URL is no longer configured by hand. The
  backend now derives and returns it (`ws_url`) with every minted token,
  so the "WebSocket host"/"WebSocket port" fields on Settings > mio
  Realtime are gone, and `mio-client.js`/`mio-embed.js` now take a single
  `wsUrl` in their config instead of `host`/`port`/`secure`. If you embed
  `mio-embed.js` directly on a page (not through this plugin), replace
  its `data-host`/`data-port`/`data-secure` attributes with a single
  `data-ws-url="wss://your-domain/ws"`.
* Fixes a real bug in the removed settings: the WebSocket port defaulted
  to 8080, which is wrong for any production deployment where the
  WebSocket endpoint shares the REST API's domain with no port.

= 0.1.1 =
* JS assets are now minified for production (`assets/js/*.min.js`,
  built with terser via `npm run build`); the plugin serves the minified
  build unless `SCRIPT_DEBUG` is on. Source `.js` files are unchanged.

= 0.1.0 =
* Initial release: `Mio\Realtime\Client` (PHP), `/wp-json/mio/v1/token`,
  the `[mio_realtime]` shortcode, and a Settings page.
