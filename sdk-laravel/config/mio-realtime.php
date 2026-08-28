<?php

/**
 * Published via `php artisan vendor:publish --tag=mio-realtime-config`.
 * Same three values as sdk-wordpress's Settings > mio Realtime screen —
 * find them at Overview or API Keys in your tenant portal.
 */
return [
    'api_url' => env('MIO_REALTIME_API_URL', 'https://realtime.example.com:8090'),
    'tenant_id' => env('MIO_REALTIME_TENANT_ID'),
    'secret' => env('MIO_REALTIME_SECRET'),
];
