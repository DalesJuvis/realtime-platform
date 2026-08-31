<?php
/**
 * MintedToken — result of `Client::mintToken()`: the signed client token
 * (safe to hand to a visitor's browser) plus how long it's valid for.
 * Never carries the tenant secret — that never leaves `Client`/the server,
 * same boundary the rest of this platform's SDKs enforce.
 */

namespace Mio\Realtime;

class MintedToken
{
    /** @var string */
    public $token;

    /** @var int */
    public $expiresIn;

    /**
     * The exact `ws://`/`wss://.../ws` URL a browser client should
     * connect to — derived server-side (`WsUrlService::derive_ws_url`)
     * from the very request that minted this token, never assembled here
     * from a host/port you'd have to keep in sync yourself.
     *
     * @var string
     */
    public $wsUrl;

    public function __construct($token, $expiresIn, $wsUrl)
    {
        $this->token = $token;
        $this->expiresIn = $expiresIn;
        $this->wsUrl = $wsUrl;
    }
}
