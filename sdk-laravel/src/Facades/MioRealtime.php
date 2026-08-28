<?php
/**
 * MioRealtime facade — thin sugar over the `Mio\Realtime\Client` singleton
 * `MioRealtimeServiceProvider` binds. `MioRealtime::mintToken('user-42')`,
 * `MioRealtime::publish('orders:42', 'order created', $minted->token)`.
 *
 * @method static \Mio\Realtime\MintedToken mintToken(string $sub, ?int $ttlSecs = null)
 * @method static bool publish(string $channelId, string $payload, string $token)
 *
 * @see \Mio\Realtime\Client
 */

namespace Mio\Realtime\Laravel\Facades;

use Illuminate\Support\Facades\Facade;
use Mio\Realtime\Client;

class MioRealtime extends Facade
{
    protected static function getFacadeAccessor()
    {
        return Client::class;
    }
}
