# mio Realtime — Laravel

Laravel service provider + facade over the same framework-independent
PHP client the WordPress plugin (`sdk-wordpress/`) uses: server-side
token minting and one-message-at-a-time publish over HTTP. Not a
persistent-WebSocket client the way `sdk-typescript`/`sdk-python`/
`sdk-rust` are — same reasoning as `sdk-wordpress`'s own README: a
Laravel request also doesn't have a long-lived process to hold a socket
open in. For a real-time browser connection *from* a Laravel-rendered
page, pair this with `@mio/realtime-sdk` (or `@mio/realtime-sdk-react`)
on the frontend — this package only covers the server side.

## Why this depends on `mio/realtime-wordpress`

`Mio\Realtime\Client`, `HttpTransport`, `HttpResponse`, `ClientException`,
and `MintedToken` live in `sdk-wordpress/includes/` and ship as part of
that Composer package — but `Client` itself calls zero WordPress
functions (see `HttpTransport.php`'s own doc comment: "the one seam
between `Client` and WordPress... a real extension point"). This
package is that extension point exercised for Laravel instead:
`LaravelHttpTransport` implements `HttpTransport` with
`Illuminate\Http\Client\Factory` in place of `wp_remote_post`, so
nothing WordPress-specific ever loads or runs. The dependency is a
naming leftover, not a functional coupling — see this repo's `DOCS.md`
for the WordPress and Laravel sections side by side.

## Status

Only `LaravelHttpTransport` has real, passing tests
(`tests/LaravelHttpTransportTest.php`, run with `composer test` — no
Laravel app bootstrap needed, `Illuminate\Http\Client\Factory` is
instantiated directly and faked). `MioRealtimeServiceProvider` and the
`MioRealtime` facade are **not** verified against a real, booted Laravel
application — no such environment was available when this package was
written. Both are small and mechanical (config binding + a singleton +
a facade accessor), but treat them as a first draft until you've run
`php artisan vendor:publish` and resolved the container binding
yourself in a real app.

Not yet published to Packagist — install it from this repo (path
repository, see `composer.json`) until it is.

## Install

```bash
composer require mio/realtime-laravel
php artisan vendor:publish --tag=mio-realtime-config
```

```env
MIO_REALTIME_API_URL=https://realtime.example.com:8090
MIO_REALTIME_TENANT_ID=<your-tenant-id>
MIO_REALTIME_SECRET=<your-tenant-secret>
```

## Usage

```php
use Mio\Realtime\Laravel\Facades\MioRealtime;

$minted = MioRealtime::mintToken('user-42'); // -> MintedToken { token, expiresIn }
MioRealtime::publish('orders:42', 'order created', $minted->token);

// Named event, JSON-serializable data — same envelope a browser client's
// client.channel(id).on(event, handler) decodes (sdk-typescript), cross-SDK:
MioRealtime::emitEvent('orders:42', 'order.created', $minted->token, ['orderId' => 123]);
```

Or resolve `Mio\Realtime\Client` directly (constructor injection, a
form request, a job) instead of the facade — both reach the same bound
singleton:

```php
use Mio\Realtime\Client;

class MintOrderToken
{
    public function __construct(private Client $client) {}

    public function handle(string $userId): string
    {
        return $this->client->mintToken($userId)->token;
    }
}
```

> **Caveat:** same HTTP-only publish path as the WordPress plugin — no
> chunking. `publish()`/`emitEvent()` throw before any network call if
> the payload (the encoded `{event, data}` JSON, for `emitEvent()`)
> exceeds 211 UTF-8 bytes; split it into multiple calls or use a
> connected SDK client (`@mio/realtime-sdk`) instead.

## Testing

```bash
composer install
composer test
```
