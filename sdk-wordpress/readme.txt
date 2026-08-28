=== mio Realtime ===
Contributors: mio
Tags: realtime, websocket, notifications, live-feed, pubsub
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.1.1
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
   tenant ID, tenant secret, and WebSocket host/port.
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

= 0.1.1 =
* JS assets are now minified for production (`assets/js/*.min.js`,
  built with terser via `npm run build`); the plugin serves the minified
  build unless `SCRIPT_DEBUG` is on. Source `.js` files are unchanged.

= 0.1.0 =
* Initial release: `Mio\Realtime\Client` (PHP), `/wp-json/mio/v1/token`,
  the `[mio_realtime]` shortcode, and a Settings page.
