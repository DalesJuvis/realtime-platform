<?php
/**
 * LaravelHttpTransport — the Laravel-side implementation of the one seam
 * `Mio\Realtime\Client` exposes for its HTTP calls (see that package's
 * `HttpTransport.php` doc comment: "a real extension point, e.g. a caller
 * with their own HTTP client/retry policy can swap it in" — this is
 * exactly that swap, using Laravel's HTTP client instead of `wp_remote_post`).
 *
 * Takes an `Illuminate\Http\Client\Factory` by constructor injection
 * rather than reaching for the static `Http` facade — keeps this class
 * testable with a plain `new Factory()` and `->fake([...])`, no service
 * container or app bootstrap required (see tests/LaravelHttpTransportTest.php).
 * `MioRealtimeServiceProvider` wires the container's own `Factory` in for
 * real requests.
 */

namespace Mio\Realtime\Laravel;

use Illuminate\Http\Client\Factory;
use Mio\Realtime\HttpResponse;
use Mio\Realtime\HttpTransport;

class LaravelHttpTransport implements HttpTransport
{
    /** @var Factory */
    private $http;

    public function __construct(Factory $http)
    {
        $this->http = $http;
    }

    /**
     * @param string $url
     * @param array<string, string> $headers
     * @param string $body
     * @return HttpResponse
     */
    public function post($url, array $headers, $body)
    {
        $response = $this->http->withHeaders($headers)->withBody($body, 'application/json')->post($url);

        return new HttpResponse($response->status(), $response->body());
    }
}
