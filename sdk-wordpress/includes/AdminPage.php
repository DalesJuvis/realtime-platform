<?php
/**
 * AdminPage — Settings > mio Realtime: the three values `Settings` reads
 * (API URL, tenant ID, secret). No WS host/port fields — see `Settings`'s
 * own doc comment for why the backend now derives that itself. Standard
 * Settings API (`register_setting`/`add_settings_field`) rather than a
 * hand-rolled form, so WordPress handles the nonce/capability check and
 * the save round-trip itself.
 */

namespace Mio\Realtime;

class AdminPage
{
    const PAGE_SLUG = 'mio-realtime';
    const OPTION_GROUP = 'mio_realtime_settings';

    /** @var Settings */
    private $settings;

    public function __construct(Settings $settings)
    {
        $this->settings = $settings;
    }

    public function registerMenu()
    {
        add_options_page(
            __('mio Realtime', 'mio-realtime'),
            __('mio Realtime', 'mio-realtime'),
            'manage_options',
            self::PAGE_SLUG,
            array($this, 'renderPage')
        );
    }

    public function registerSettings()
    {
        register_setting(self::OPTION_GROUP, Settings::OPTION_API_URL, array('sanitize_callback' => 'esc_url_raw'));
        register_setting(self::OPTION_GROUP, Settings::OPTION_TENANT_ID, array('sanitize_callback' => 'sanitize_text_field'));
        register_setting(self::OPTION_GROUP, Settings::OPTION_SECRET, array('sanitize_callback' => 'sanitize_text_field'));

        add_settings_section(
            'mio_realtime_main',
            __('Connection', 'mio-realtime'),
            function () {
                echo '<p>' . esc_html__(
                    'From your realtime-platform tenant portal: Settings > API keys for the tenant ID and secret, and your engine deployment for the Portal API URL. The WebSocket URL is derived by the backend itself for every minted token — nothing to configure here.',
                    'mio-realtime'
                ) . '</p>';
            },
            self::PAGE_SLUG
        );

        $this->addField(Settings::OPTION_API_URL, __('Portal API URL', 'mio-realtime'), 'https://realtime.example.com:8090');
        $this->addField(Settings::OPTION_TENANT_ID, __('Tenant ID', 'mio-realtime'), '12345678-9abc-def0-1122-334455667788');
        $this->addField(Settings::OPTION_SECRET, __('Tenant secret', 'mio-realtime'), '', 'password');
    }

    private function addField($option, $label, $placeholder, $type = 'text')
    {
        add_settings_field(
            $option,
            $label,
            function () use ($option, $placeholder, $type) {
                printf(
                    '<input type="%1$s" name="%2$s" value="%3$s" placeholder="%4$s" class="regular-text" autocomplete="off" />',
                    esc_attr($type),
                    esc_attr($option),
                    esc_attr((string) get_option($option, '')),
                    esc_attr($placeholder)
                );
            },
            self::PAGE_SLUG,
            'mio_realtime_main'
        );
    }

    public function renderPage()
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('mio Realtime', 'mio-realtime'); ?></h1>
            <?php if (!$this->settings->isConfigured()) : ?>
                <div class="notice notice-warning">
                    <p><?php esc_html_e('Not fully configured yet — the [mio_realtime] shortcode and REST token route stay disabled until API URL, tenant ID, and secret are all set.', 'mio-realtime'); ?></p>
                </div>
            <?php endif; ?>
            <form action="options.php" method="post">
                <?php
                settings_fields(self::OPTION_GROUP);
                do_settings_sections(self::PAGE_SLUG);
                submit_button();
                ?>
            </form>
            <hr />
            <h2><?php esc_html_e('Usage', 'mio-realtime'); ?></h2>
            <p><code>[mio_realtime channel="orders:42"]</code></p>
            <p><?php esc_html_e('Drop that shortcode anywhere to show a live feed of one channel — see this plugin\'s README.md for the full attribute list and the PHP Client API (Mio\\Realtime\\Client) for server-side publishing.', 'mio-realtime'); ?></p>
        </div>
        <?php
    }
}
