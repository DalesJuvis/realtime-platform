<?php
/**
 * Settings — thin wrapper around the WordPress Options API for this
 * plugin's four config values (API URL, tenant ID, secret, WS host/port).
 * The secret is stored via `update_option()` like the rest — WordPress
 * has no built-in secrets vault, and encrypting it locally with a key
 * that then has to live *somewhere* in the same `wp-config.php`/DB
 * doesn't actually raise the bar; the real boundary this plugin enforces
 * is that the secret only ever leaves PHP once, over HTTPS, to mint a
 * token (see `Client::mintToken`) — it is never sent to the browser.
 */

namespace Mio\Realtime;

class Settings
{
    const OPTION_API_URL = 'mio_realtime_api_url';
    const OPTION_TENANT_ID = 'mio_realtime_tenant_id';
    const OPTION_SECRET = 'mio_realtime_secret';
    const OPTION_WS_HOST = 'mio_realtime_ws_host';
    const OPTION_WS_PORT = 'mio_realtime_ws_port';

    /** @return string */
    public function getApiUrl()
    {
        return (string) get_option(self::OPTION_API_URL, '');
    }

    /** @return string */
    public function getTenantId()
    {
        return (string) get_option(self::OPTION_TENANT_ID, '');
    }

    /** @return string */
    public function getSecret()
    {
        return (string) get_option(self::OPTION_SECRET, '');
    }

    /** @return string */
    public function getWsHost()
    {
        return (string) get_option(self::OPTION_WS_HOST, '');
    }

    /** @return int */
    public function getWsPort()
    {
        $port = get_option(self::OPTION_WS_PORT, 8080);
        return (int) $port;
    }

    /** @return bool true once the values `Client`/the REST route need are all set. */
    public function isConfigured()
    {
        return $this->getApiUrl() !== '' && $this->getTenantId() !== '' && $this->getSecret() !== '';
    }

    /** @return Client */
    public function buildClient()
    {
        return new Client($this->getApiUrl(), $this->getTenantId(), $this->getSecret());
    }
}
