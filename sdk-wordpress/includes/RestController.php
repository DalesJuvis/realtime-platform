<?php
/**
 * RestController — `GET /wp-json/mio/v1/token`, the only way
 * `assets/js/mio-client.js` (running in a visitor's browser) ever gets a
 * token: minted here, server-side, via `Client::mintToken()` — the tenant
 * secret stays in PHP and is never part of this response.
 *
 * Deliberately public (no WordPress auth/nonce required): the shortcode
 * widget is meant to work for anonymous visitors reading a public live
 * channel, the same way the channel itself has no per-visitor ACL in this
 * backend's model — a token is tenant+sub scoped, not channel-scoped.
 * `ttl_secs` is hardcoded rather than accepted from the request precisely
 * because this route has no auth: nothing should let an anonymous caller
 * ask for an arbitrarily long-lived token.
 */

namespace Mio\Realtime;

class RestController
{
    const TOKEN_TTL_SECS = 3600;

    /** @var Settings */
    private $settings;

    public function __construct(Settings $settings)
    {
        $this->settings = $settings;
    }

    public function registerRoutes()
    {
        register_rest_route('mio/v1', '/token', array(
            'methods' => 'GET',
            'callback' => array($this, 'handleGetToken'),
            'permission_callback' => '__return_true',
            'args' => array(
                'sub' => array(
                    'required' => false,
                    'sanitize_callback' => 'sanitize_text_field',
                ),
            ),
        ));
    }

    /**
     * @param \WP_REST_Request $request
     * @return \WP_REST_Response|\WP_Error
     */
    public function handleGetToken($request)
    {
        if (!$this->settings->isConfigured()) {
            return new \WP_Error(
                'mio_not_configured',
                __('mio Realtime is not configured yet — set the API URL, tenant ID, and secret under Settings > mio Realtime.', 'mio-realtime'),
                array('status' => 503)
            );
        }

        $sub = $request->get_param('sub');
        if (empty($sub)) {
            $sub = is_user_logged_in() ? ('wp-user-' . get_current_user_id()) : 'anonymous';
        }
        $sub = substr($sub, 0, 64);

        try {
            $minted = $this->settings->buildClient()->mintToken($sub, self::TOKEN_TTL_SECS);
        } catch (ClientException $e) {
            return new \WP_Error('mio_mint_failed', $e->getMessage(), array('status' => 502));
        }

        return new \WP_REST_Response(array(
            'token' => $minted->token,
            'expires_in' => $minted->expiresIn,
            'tenant_id' => $this->settings->getTenantId(),
            // The backend's own derived URL (WsUrlService::derive_ws_url),
            // not the WP-admin-configured ws_host/ws_port fields this used
            // to return — those had to be kept in sync by hand, and a
            // hardcoded port default further up this same chain was
            // simply wrong in production behind a reverse proxy.
            'ws_url' => $minted->wsUrl,
        ), 200);
    }
}
