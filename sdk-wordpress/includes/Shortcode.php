<?php
/**
 * Shortcode — `[mio_realtime channel="orders:42"]`: renders an empty
 * feed container and enqueues `assets/js/mio-client.js` +
 * `assets/js/mio-shortcode.js`, which fetch a token from
 * `RestController`'s REST route, connect, subscribe to `channel`, and
 * append each message's payload as a list item. A working minimal demo
 * widget, not a themed one — same "point to start from, not a finished
 * UI" stance as `sdk-react`'s `<ConnectionIndicator>`.
 *
 * Attributes:
 *   channel  (required) — exact channel id or an "orders:*"-style pattern.
 *   limit    (optional, default 20) — max messages kept in the feed DOM.
 *   replay   (optional) — "true" to request history since connect
 *            (`client.replay(channel, 0)`), omitted/"false" for live-only.
 */

namespace Mio\Realtime;

class Shortcode
{
    /** @var Settings */
    private $settings;

    /** @var bool */
    private $assetsEnqueued = false;

    public function __construct(Settings $settings)
    {
        $this->settings = $settings;
    }

    public function register()
    {
        add_shortcode('mio_realtime', array($this, 'render'));
    }

    /**
     * @param array<string, string>|string $atts
     * @return string
     */
    public function render($atts)
    {
        $atts = shortcode_atts(array(
            'channel' => '',
            'limit' => '20',
            'replay' => 'false',
        ), $atts, 'mio_realtime');

        if ($atts['channel'] === '') {
            return is_user_logged_in() && current_user_can('manage_options')
                ? '<p><em>' . esc_html__('[mio_realtime]: a "channel" attribute is required.', 'mio-realtime') . '</em></p>'
                : '';
        }

        if (!$this->settings->isConfigured()) {
            return is_user_logged_in() && current_user_can('manage_options')
                ? '<p><em>' . esc_html__('[mio_realtime]: plugin not configured — see Settings > mio Realtime.', 'mio-realtime') . '</em></p>'
                : '';
        }

        $this->enqueueAssets();

        $id = 'mio-realtime-' . wp_unique_id();

        return sprintf(
            '<div class="mio-realtime-feed" id="%1$s" data-mio-channel="%2$s" data-mio-limit="%3$s" data-mio-replay="%4$s">' .
                '<p class="mio-realtime-status">%5$s</p>' .
                '<ul class="mio-realtime-messages"></ul>' .
            '</div>',
            esc_attr($id),
            esc_attr($atts['channel']),
            esc_attr((string) max(1, (int) $atts['limit'])),
            esc_attr($atts['replay'] === 'true' ? 'true' : 'false'),
            esc_html__('Connecting…', 'mio-realtime')
        );
    }

    private function enqueueAssets()
    {
        if ($this->assetsEnqueued) {
            return;
        }
        $this->assetsEnqueued = true;

        $version = defined('MIO_REALTIME_VERSION') ? MIO_REALTIME_VERSION : false;

        wp_enqueue_script(
            'mio-realtime-protocol',
            MIO_REALTIME_URL . 'assets/js/mio-protocol.js',
            array(),
            $version,
            true
        );
        wp_enqueue_script(
            'mio-realtime-client',
            MIO_REALTIME_URL . 'assets/js/mio-client.js',
            array('mio-realtime-protocol'),
            $version,
            true
        );
        wp_enqueue_script(
            'mio-realtime-shortcode',
            MIO_REALTIME_URL . 'assets/js/mio-shortcode.js',
            array('mio-realtime-client'),
            $version,
            true
        );

        wp_localize_script('mio-realtime-shortcode', 'mioRealtimeConfig', array(
            'restTokenUrl' => rest_url('mio/v1/token'),
        ));
    }
}
