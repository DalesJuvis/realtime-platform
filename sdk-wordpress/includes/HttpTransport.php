<?php
/**
 * HttpTransport — the one seam between `Client` and WordPress.
 *
 * `Client` itself calls nothing WordPress-specific (no `wp_remote_post`,
 * no `wp_json_encode`) — every HTTP call goes through this interface
 * instead, injected at construction (`WpHttpTransport` by default, see
 * its own file). Two reasons: it's what actually makes `ClientTest.php`
 * runnable in plain PHPUnit without a full WordPress + MySQL test
 * bootstrap (there's no WP install in the environment this plugin was
 * written in to test against — see this package's README's "Statut de
 * validation"); and it's a real extension point, e.g. a caller with their
 * own HTTP client/retry policy can swap it in.
 */

namespace Mio\Realtime;

interface HttpTransport
{
    /**
     * @param string $url
     * @param array<string, string> $headers
     * @param string $body
     * @return HttpResponse
     * @throws \Exception on a transport-level failure (DNS, timeout, TLS —
     *         never for a non-2xx HTTP status, which is a valid HttpResponse).
     */
    public function post($url, array $headers, $body);
}
