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

    public function __construct($token, $expiresIn)
    {
        $this->token = $token;
        $this->expiresIn = $expiresIn;
    }
}
