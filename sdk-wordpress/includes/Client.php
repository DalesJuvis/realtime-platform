<?php
/**
 * Client — server-side (PHP) client for the platform's HTTP surface:
 * minting a client token and publishing one message, the two operations
 * that fit a WordPress request's lifecycle (see this package's README for
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
     * @param string $channelId
     * @param string $payload
     * @throws ClientException
     */
    private static function assertFits($channelId, $payload)
    {
        if (strlen($channelId) > self::MAX_CHANNEL_ID_BYTES) {
            throw new ClientException(
                'channel_id exceeds ' . self::MAX_CHANNEL_ID_BYTES . ' bytes',
                'CHANNEL_ID_TOO_LONG'
            );
        }
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
