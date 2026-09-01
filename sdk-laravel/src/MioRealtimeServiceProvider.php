<?php
/**
 * MioRealtimeServiceProvider — composition root for the Laravel package,
 * same role `bootstrap()` plays in `mio-realtime.php` for the WordPress
 * plugin: the one place allowed to just wire things together procedurally.
 * Binds a `Mio\Realtime\Client` singleton, backed by `LaravelHttpTransport`,
 * configured from `config/mio-realtime.php`. `LaravelHttpTransport` is also
 * bound on its own (not just wrapped inside `Client`) so `publishTemplate()`
 * — which calls `POST /api/v1/messages/template` directly rather than
 * through `Client`, see that method's doc comment — is reachable as
 * `app(LaravelHttpTransport::class)->publishTemplate(...)`; both bindings
 * share the same instance.
 */

namespace Mio\Realtime\Laravel;

use Illuminate\Http\Client\Factory;
use Illuminate\Support\ServiceProvider;
use Mio\Realtime\Client;

class MioRealtimeServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/mio-realtime.php', 'mio-realtime');

        $this->app->singleton(LaravelHttpTransport::class, function ($app) {
            $config = $app['config']->get('mio-realtime');

            return new LaravelHttpTransport($app->make(Factory::class), $config['api_url'], $config['tenant_id']);
        });

        $this->app->singleton(Client::class, function ($app) {
            $config = $app['config']->get('mio-realtime');

            return new Client(
                $config['api_url'],
                $config['tenant_id'],
                $config['secret'],
                $app->make(LaravelHttpTransport::class)
            );
        });

        $this->app->alias(Client::class, 'mio-realtime');
    }

    public function boot()
    {
        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/../config/mio-realtime.php' => config_path('mio-realtime.php'),
            ], 'mio-realtime-config');
        }
    }
}
