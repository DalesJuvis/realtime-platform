<?php
/**
 * ClientException — thrown by `Client` for both local validation failures
 * (oversized payload) and API error responses (`{success:false,error:...}`).
 * Carries the API's own `code` string (`"UNAUTHORIZED"`, `"RATE_LIMITED"`,
 * ...) separately from the built-in integer exception code, since that's
 * what the backend's error envelope actually gives callers to branch on
 * (see `backend/src/modules/auth/dto/ApiEnvelope.rs`).
 */

namespace Mio\Realtime;

class ClientException extends \Exception
{
    /** @var string */
    private $errorCode;

    /** @var int|null */
    private $httpStatus;

    public function __construct($message, $errorCode = 'UNKNOWN', $httpStatus = null)
    {
        parent::__construct($message);
        $this->errorCode = $errorCode;
        $this->httpStatus = $httpStatus;
    }

    /** @return string */
    public function getErrorCode()
    {
        return $this->errorCode;
    }

    /** @return int|null */
    public function getHttpStatus()
    {
        return $this->httpStatus;
    }
}
