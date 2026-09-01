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
 *
 * `$apiUrl`/`$tenantId` are optional constructor arguments used only by
 * `publishTemplate()` below (`post()` itself needs neither — the caller
 * always hands it a full URL). Both default to `null` so every existing
 * call site (`new LaravelHttpTransport($factory)`, including this file's
 * own tests) keeps compiling unchanged.
 */

namespace Mio\Realtime\Laravel;

use Illuminate\Http\Client\Factory;
use Mio\Realtime\ClientException;
use Mio\Realtime\HttpResponse;
use Mio\Realtime\HttpTransport;

class LaravelHttpTransport implements HttpTransport
{
    /** @var Factory */
    private $http;

    /** @var string|null */
    private $apiUrl;

    /** @var string|null */
    private $tenantId;

    /**
     * @param Factory $http
     * @param string|null $apiUrl e.g. "https://realtime.example.com:8090" —
     *        only needed for `publishTemplate()`, see that method's doc comment.
     * @param string|null $tenantId
     */
    public function __construct(Factory $http, $apiUrl = null, $tenantId = null)
    {
        $this->http = $http;
        $this->apiUrl = $apiUrl !== null ? rtrim($apiUrl, '/') : null;
        $this->tenantId = $tenantId;
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

    /**
     * publishTemplate — sends one of the tenant's saved templates
     * (tenant-portal → Templates) by id instead of a raw payload; the
     * `{{variable}}` placeholders are filled in server-side (see `DOCS.md`'s
     * "Publish a saved template over HTTP", `POST /api/v1/messages/template`).
     * Cross-SDK, every connected client exposes this as
     * `publishTemplate(channelId, templateId, variables)` alongside its
     * `publish(channelId, payload)` — same shape here, plus the explicit
     * `$token` this HTTP-only package's `Client::publish()` already takes
     * (there's no persistent connection to carry one as session state).
     *
     * This lives here rather than on `Mio\Realtime\Client` (the class that
     * owns `mintToken()`/`publish()`/`emitEvent()`, in this package's
     * `mio/realtime-wordpress` dependency — see README's "Why this depends
     * on `mio/realtime-wordpress`") only because `Client` doesn't have a
     * `publishTemplate()` of its own yet; that's tracked separately. Until
     * then this reimplements `Client::publish()`/`request()`'s own pattern
     * verbatim — same envelope decoding, same `ClientException` on a
     * non-2xx or `{success:false}` response — directly against the new
     * endpoint, through `post()` above.
     *
     * `variables` is always sent as a JSON *object*, even when empty
     * (`(object) []` encodes to `{}`, never `[]`) — the backend expects an
     * object it can look `{{name}}` up in, not an array.
     *
     * @param string $channelId
     * @param string $templateId A saved template's id, from tenant-portal's
     *        Templates page.
     * @param string $token From `Client::mintToken()`, never the raw tenant secret.
     * @param array<string, string> $variables `{{variable}}` values to interpolate
     *        server-side. A placeholder with no matching entry renders as an
     *        empty string, not the literal `{{placeholder}}`. Defaults to none.
     * @return bool
     * @throws ClientException On `TEMPLATE_NOT_FOUND` (unknown id, or one
     *         belonging to a different tenant), `INVALID_REQUEST` (the
     *         *rendered* text — after interpolation — still has to fit the
     *         same 211-UTF-8-byte cap `publish()` enforces on a raw
     *         payload), `UNAUTHORIZED`/`RATE_LIMITED`, or a malformed
     *         response.
     * @throws \LogicException If constructed without `$apiUrl`/`$tenantId`
     *         (only `MioRealtimeServiceProvider`'s real binding supplies
     *         them; a bare `new LaravelHttpTransport($factory)` — as in
     *         most of this file's own tests — has neither).
     */
    public function publishTemplate($channelId, $templateId, $token, array $variables = [])
    {
        if ($this->apiUrl === null || $this->tenantId === null) {
            throw new \LogicException(
                'publishTemplate() requires LaravelHttpTransport to be constructed with ' .
                    '$apiUrl and $tenantId (MioRealtimeServiceProvider does this from ' .
                    'config/mio-realtime.php for the real container binding).'
            );
        }

        $headers = [
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer ' . $token,
        ];
        $body = (string) json_encode([
            'tenant_id' => $this->tenantId,
            'channel_id' => $channelId,
            'template_id' => $templateId,
            'variables' => (object) $variables,
        ]);

        $response = $this->post($this->apiUrl . '/api/v1/messages/template', $headers, $body);

        $decoded = json_decode($response->body, true);
        if (!is_array($decoded)) {
            throw new ClientException(
                'malformed JSON response from /api/v1/messages/template',
                'INVALID_RESPONSE',
                $response->status
            );
        }

        if (empty($decoded['success'])) {
            $error = isset($decoded['error']) && is_array($decoded['error']) ? $decoded['error'] : [];
            throw new ClientException(
                isset($error['message']) ? $error['message'] : 'request failed',
                isset($error['code']) ? $error['code'] : 'UNKNOWN',
                $response->status
            );
        }

        $data = isset($decoded['data']) && is_array($decoded['data']) ? $decoded['data'] : [];
        return !empty($data['published']);
    }
}
