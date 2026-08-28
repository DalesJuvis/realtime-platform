<?php
/**
 * Plugin Name:       mio Realtime
 * Plugin URI:        https://github.com/DalesJuvis/realtime-platform/tree/master/sdk-wordpress
 * Description:       Connects a WordPress site to a mio realtime-platform tenant — server-side token minting and message publishing (PHP), plus a [mio_realtime channel="..."] shortcode for a live-updating feed in the browser.
 * Version:           0.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            mio
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       mio-realtime
 *
 * See README.md in this directory for the full picture, including the
 * "Statut de validation" section on what has and hasn't been verified in
 * the environment this plugin was written in (no live WordPress install
 * available to test the WordPress-integration classes against — the
 * framework-independent Client class does have real, passing PHPUnit
 * tests; see tests/php/ClientTest.php).
 */

namespace Mio\Realtime;

if (!defined('ABSPATH')) {
    exit; // Direct access disallowed.
}

define('MIO_REALTIME_VERSION', '0.1.0');
define('MIO_REALTIME_DIR', plugin_dir_path(__FILE__));
define('MIO_REALTIME_URL', plugin_dir_url(__FILE__));

$mioRealtimeAutoload = MIO_REALTIME_DIR . 'vendor/autoload.php';
if (file_exists($mioRealtimeAutoload)) {
    require_once $mioRealtimeAutoload;
} else {
    // No Composer install present (e.g. installed as a plain zip without
    // running `composer install --no-dev`) — fall back to a manual
    // include list rather than fataling the whole site.
    require_once MIO_REALTIME_DIR . 'includes/HttpResponse.php';
    require_once MIO_REALTIME_DIR . 'includes/HttpTransport.php';
    require_once MIO_REALTIME_DIR . 'includes/WpHttpTransport.php';
    require_once MIO_REALTIME_DIR . 'includes/ClientException.php';
    require_once MIO_REALTIME_DIR . 'includes/MintedToken.php';
    require_once MIO_REALTIME_DIR . 'includes/Client.php';
    require_once MIO_REALTIME_DIR . 'includes/Settings.php';
    require_once MIO_REALTIME_DIR . 'includes/RestController.php';
    require_once MIO_REALTIME_DIR . 'includes/Shortcode.php';
    require_once MIO_REALTIME_DIR . 'includes/AdminPage.php';
}

/**
 * Composition root — mirrors this monorepo's other backends (see
 * `backend/src/main.rs`'s own doc comment): the one place allowed to just
 * wire things together procedurally.
 */
function bootstrap()
{
    $settings = new Settings();

    $rest = new RestController($settings);
    add_action('rest_api_init', array($rest, 'registerRoutes'));

    $shortcode = new Shortcode($settings);
    $shortcode->register();

    if (is_admin()) {
        $adminPage = new AdminPage($settings);
        add_action('admin_menu', array($adminPage, 'registerMenu'));
        add_action('admin_init', array($adminPage, 'registerSettings'));
    }
}

add_action('plugins_loaded', __NAMESPACE__ . '\\bootstrap');
