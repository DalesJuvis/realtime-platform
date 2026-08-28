<?php
/**
 * FakeHttpTransport — canned-response `HttpTransport` for `ClientTest`.
 * Records every call it receives (`$requests`) so tests can assert on the
 * exact URL/headers/body `Client` sent, not just the parsed result.
 */

namespace Mio\Realtime\Tests;

use Mio\Realtime\HttpResponse;
use Mio\Realtime\HttpTransport;

class FakeHttpTransport implements HttpTransport
{
    /** @var HttpResponse */
    private $response;

    /** @var array<int, array{url: string, headers: array<string, string>, body: string}> */
    public $requests = array();

    public function __construct(HttpResponse $response)
    {
        $this->response = $response;
    }

    public function post($url, array $headers, $body)
    {
        $this->requests[] = array('url' => $url, 'headers' => $headers, 'body' => $body);
        return $this->response;
    }
}
