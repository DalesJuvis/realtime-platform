<?php
/**
 * WpHttpTransport — the real, production `HttpTransport`: WordPress's own
 * HTTP API (`wp_remote_post`), which already handles proxies, SSL
 * verification, and the various transport backends (cURL/streams) a raw
 * `curl_exec` call would have to reimplement — the idiomatic choice inside
 * a WordPress plugin. Only loaded when WordPress itself is (see the
 * `function_exists` guard in `mio-realtime.php`), so requiring this file
 * outside WordPress — e.g. `ClientTest.php` — never fatals on a missing
 * `wp_remote_post`.
 */

namespace Mio\Realtime;

class WpHttpTransport implements HttpTransport
{
    /** @var int */
    private $timeoutSecs;

    public function __construct($timeoutSecs = 10)
    {
        $this->timeoutSecs = $timeoutSecs;
    }

    public function post($url, array $headers, $body)
    {
        $response = wp_remote_post($url, array(
            'headers' => $headers,
            'body' => $body,
            'timeout' => $this->timeoutSecs,
        ));

        if (is_wp_error($response)) {
            throw new \Exception($response->get_error_message());
        }

        return new HttpResponse(
            wp_remote_retrieve_response_code($response),
            wp_remote_retrieve_body($response)
        );
    }
}
