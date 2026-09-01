<?php
/**
 * Client — server-side (PHP) client for the platform's HTTP surface:
 * minting a client token and publishing one message (raw, or a saved
 * tenant-portal template by id), the operations that fit a WordPress
 * request's lifecycle (see this package's README for
 * why this is deliberately *not* a persistent-WebSocket client the way
 * `sdk-typescript`/`sdk-python`/`sdk-rust` are — PHP-under-WordPress has
 * no long-lived process to hold a socket open in).
 *
 * The tenant secret passed to the constructor never leaves this class: it
 * is sent once, over HTTPS, to `/api/v1/auth/tokens` to mint a token —
 * `publish()` and every browser-facing use only ever see that token. This
 * mirrors the "auth before connect" flow documented in `sdk-typescript`'s
 * README exactly.
 */

namespace Mio\Realtime;

class Client
{
    const MAX_CHANNEL_ID_BYTES = 24;
    const MAX_PAYLOAD_BYTES = 211;

    /** @var string */
    private $apiUrl;

    /** @var string */
    private $tenantId;

    /** @var string */
    private $secret;

    /** @var HttpTransport */
    private $transport;

    /**
     * @param string $apiUrl e.g. "https://realtime.example.com:8090" — the
     *        Portal API, not the WebSocket port.
     * @param string $tenantId
     * @param string $secret Never logged, never sent anywhere but
     *        `/api/v1/auth/tokens`, never returned by any method here.
     * @param HttpTransport|null $transport Defaults to `WpHttpTransport`
     *        (requires WordPress to be loaded); inject your own outside
     *        WordPress or in tests.
     */
    public function __construct($apiUrl, $tenantId, $secret, ?HttpTransport $transport = null)
    {
        $this->apiUrl = rtrim($apiUrl, '/');
        $this->tenantId = $tenantId;
        $this->secret = $secret;
        $this->transport = $transport !== null ? $transport : new WpHttpTransport();
    }

    /**
     * Mints a client token for `$sub` (the end user this token identifies
     * to the realtime engine) — call this server-side, then hand only the
     * resulting `MintedToken::$token` to the browser (see
     * `RestController`).
     *
     * @param string $sub
     * @param int|null $ttlSecs Defaults to the server's own default
     *        (3600s) if omitted.
     * @return MintedToken
     * @throws ClientException
     */
    public function mintToken($sub, $ttlSecs = null)
    {
        $body = array(
            'tenant_id' => $this->tenantId,
            'secret' => $this->secret,
            'sub' => $sub,
        );
        if ($ttlSecs !== null) {
            $body['ttl_secs'] = $ttlSecs;
        }

        $data = $this->request('/api/v1/auth/tokens', $body);
        return new MintedToken($data['token'], (int) $data['expires_in'], $data['ws_url']);
    }

    /**
     * Publishes one message to `$channelId`, authenticated with a client
     * token already minted via `mintToken()` — never the raw secret.
     *
     * **Limitation inherited from the HTTP publish endpoint itself** (see
     * `sdk-typescript`'s README): no chunking. `$payload` over 211 UTF-8
     * bytes throws `ClientException` locally, before any network call —
     * split it into multiple `publish()` calls, or use a connected SDK
     * client (browser-side `assets/js/mio-client.js` in this package, or
     * `sdk-typescript` directly) if you need larger messages.
     *
     * @param string $channelId
     * @param string $payload
     * @param string $token From `mintToken()`.
     * @return bool
     * @throws ClientException
     */
    public function publish($channelId, $payload, $token)
    {
        self::assertFits($channelId, $payload);

        $data = $this->request('/api/v1/messages', array(
            'tenant_id' => $this->tenantId,
            'channel_id' => $channelId,
            'payload' => $payload,
        ), $token);

        return !empty($data['published']);
    }

    /**
     * Publishes a named event with JSON-serializable data — a `publish()`
     * whose payload encodes `{"event": ..., "data": ...}`, the exact same
     * envelope `sdk-typescript`'s `ChannelHandle` (`client.channel(id).on()`/
     * `.emit()`, see that SDK's `channel.ts`) uses — a browser client's
     * `on($event, $handler)` receives exactly what this emits, cross-SDK,
     * with no server-side change: it's still one `publish()` under the hood.
     *
     * Not a protocol change, so it inherits `publish()`'s own limits
     * unmodified: the encoded JSON still counts against the 211-byte,
     * no-chunking cap (see `publish()`'s own doc comment) — a real
     * WebSocket client (`assets/js/mio-embed.js`, `sdk-typescript`
     * directly) is the option for events whose data won't fit.
     *
     * @param string $channelId
     * @param string $event
     * @param string $token From `mintToken()`.
     * @param mixed $data JSON-serializable. Omit for an event with no data
     *        (encodes as `{"event": "..."}`, no `data` key at all —
     *        symmetric with `sdk-typescript`'s `emit(event)` with no `data` argument).
     * @return bool
     * @throws ClientException
     */
    public function emitEvent($channelId, $event, $token, $data = null)
    {
        $envelope = $data === null ? array('event' => $event) : array('event' => $event, 'data' => $data);
        return $this->publish($channelId, (string) json_encode($envelope), $token);
    }

    /**
     * Publishes a saved tenant-portal template (Templates page) by id to
     * `$channelId` — its `{{variable}}` placeholders are filled in
     * **server-side** from `$variables`, so this call never needs the
     * template's own text or the tenant's full template list, only
     * `$templateId` and the values to fill in (see DOCS.md's "Publish a
     * saved template over HTTP").
     *
     * Unlike `publish()`, there's no local pre-network size guard here:
     * the 211-UTF-8-byte cap is the same, but it's enforced server-side
     * only, *after* interpolation — this method has no way to know the
     * rendered length without the template's own text. An oversized
     * result surfaces as `ClientException` with error code
     * `INVALID_REQUEST` from the API call itself. `$channelId` is still
     * checked locally, same as `publish()`.
     *
     * @param string $channelId
     * @param string $templateId From tenant-portal's Templates page.
     * @param string $token From `mintToken()`.
     * @param array<string, string> $variables Values to fill
     *        `{{name}}`-style placeholders with (inner whitespace like
     *        `{{ name }}` is tolerated); a placeholder with no matching
     *        entry renders as an empty string, not the literal
     *        placeholder. Omit for a template with no placeholders.
     * @return bool
     * @throws ClientException `TEMPLATE_NOT_FOUND` if `$templateId`
     *         doesn't exist or belongs to a different tenant.
     */
    public function publishTemplate($channelId, $templateId, $token, array $variables = array())
    {
        self::assertChannelIdFits($channelId);

        $data = $this->request('/api/v1/messages/template', array(
            'tenant_id' => $this->tenantId,
            'channel_id' => $channelId,
            'template_id' => $templateId,
            // Cast an empty map to an object so it encodes as JSON `{}`,
            // never `[]` — json_encode() can't otherwise distinguish an
            // empty associative array from an empty list, and the API
            // expects an object (see DOCS.md: "variables is a
            // string-to-string map, send {} if none").
            'variables' => empty($variables) ? new \stdClass() : $variables,
        ), $token);

        return !empty($data['published']);
    }

    /**
     * @param string $channelId
     * @throws ClientException
     */
    private static function assertChannelIdFits($channelId)
    {
        if (strlen($channelId) > self::MAX_CHANNEL_ID_BYTES) {
            throw new ClientException(
                'channel_id exceeds ' . self::MAX_CHANNEL_ID_BYTES . ' bytes',
                'CHANNEL_ID_TOO_LONG'
            );
        }
    }

    /**
     * @param string $channelId
     * @param string $payload
     * @throws ClientException
     */
    private static function assertFits($channelId, $payload)
    {
        self::assertChannelIdFits($channelId);
        if (strlen($payload) > self::MAX_PAYLOAD_BYTES) {
            throw new ClientException(
                'payload exceeds ' . self::MAX_PAYLOAD_BYTES . ' bytes — this endpoint does not chunk, ' .
                    'split it into multiple publish() calls or use a connected client instead',
                'PAYLOAD_TOO_LARGE'
            );
        }
    }

    /**
     * @param string $path
     * @param array<string, mixed> $body
     * @param string|null $bearerToken
     * @return array<string, mixed> the response envelope's `data`
     * @throws ClientException
     */
    private function request($path, array $body, $bearerToken = null)
    {
        $headers = array('Content-Type' => 'application/json');
        if ($bearerToken !== null) {
            $headers['Authorization'] = 'Bearer ' . $bearerToken;
        }

        $response = $this->transport->post($this->apiUrl . $path, $headers, (string) json_encode($body));

        $decoded = json_decode($response->body, true);
        if (!is_array($decoded)) {
            throw new ClientException(
                'malformed JSON response from ' . $path,
                'INVALID_RESPONSE',
                $response->status
            );
        }

        if (empty($decoded['success'])) {
            $error = isset($decoded['error']) && is_array($decoded['error']) ? $decoded['error'] : array();
            throw new ClientException(
                isset($error['message']) ? $error['message'] : 'request failed',
                isset($error['code']) ? $error['code'] : 'UNKNOWN',
                $response->status
            );
        }

        return isset($decoded['data']) && is_array($decoded['data']) ? $decoded['data'] : array();
    }
}
