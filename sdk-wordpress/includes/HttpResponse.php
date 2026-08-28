<?php
/**
 * HttpResponse — plain value object returned by any HttpTransport
 * implementation. Deliberately not `wp_remote_*`'s own array shape: Client
 * is framework-agnostic (see HttpTransport's doc comment), so its contract
 * can't depend on WordPress's response format either.
 */

namespace Mio\Realtime;

class HttpResponse
{
    /** @var int */
    public $status;

    /** @var string */
    public $body;

    public function __construct($status, $body)
    {
        $this->status = $status;
        $this->body = $body;
    }
}
