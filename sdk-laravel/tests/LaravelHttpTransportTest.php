<?php
/**
 * LaravelHttpTransportTest — real PHPUnit tests, no Laravel app bootstrap:
 * `Illuminate\Http\Client\Factory` is instantiated directly and faked,
 * same pattern `ClientTest.php` in sdk-wordpress uses against
 * `FakeHttpTransport` — both prove the seam works without a live server.
 */

namespace Mio\Realtime\Laravel\Tests;

use Illuminate\Http\Client\Factory;
use Mio\Realtime\Client;
use Mio\Realtime\Laravel\LaravelHttpTransport;
use PHPUnit\Framework\TestCase;

final class LaravelHttpTransportTest extends TestCase
{
    public function testMintTokenRoundTripsThroughTheFakeHttpFactory()
    {
        $factory = new Factory();
        $factory->fake([
            '*' => Factory::response(
                ['success' => true, 'data' => ['token' => 'signed.token.value', 'expires_in' => 3600]],
                200
            ),
        ]);

        $client = new Client(
            'https://realtime.example.com:8090',
            'tenant-1',
            'super-secret',
            new LaravelHttpTransport($factory)
        );

        $minted = $client->mintToken('user-42');

        self::assertSame('signed.token.value', $minted->token);
        self::assertSame(3600, $minted->expiresIn);

        $factory->assertSent(function ($request) {
            return $request->url() === 'https://realtime.example.com:8090/api/v1/auth/tokens'
                && $request['secret'] === 'super-secret'
                && $request['sub'] === 'user-42';
        });
    }

    public function testPublishSendsBearerTokenAsAnAuthorizationHeader()
    {
        $factory = new Factory();
        $factory->fake([
            '*' => Factory::response(
                ['success' => true, 'data' => ['published' => true]],
                200
            ),
        ]);

        $client = new Client(
            'https://realtime.example.com:8090',
            'tenant-1',
            'super-secret',
            new LaravelHttpTransport($factory)
        );

        $ok = $client->publish('orders:42', 'order created', 'a-client-token');

        self::assertTrue($ok);
        $factory->assertSent(function ($request) {
            return $request->hasHeader('Authorization', 'Bearer a-client-token')
                && $request['channel_id'] === 'orders:42'
                && $request['payload'] === 'order created'
                && !isset($request['secret']);
        });
    }

    public function testApiErrorEnvelopeSurfacesTheHttpStatusFromLaravelsResponse()
    {
        $factory = new Factory();
        $factory->fake([
            '*' => Factory::response(
                ['success' => false, 'error' => ['code' => 'UNAUTHORIZED', 'message' => 'invalid tenant secret']],
                401
            ),
        ]);

        $client = new Client(
            'https://realtime.example.com:8090',
            'tenant-1',
            'wrong-secret',
            new LaravelHttpTransport($factory)
        );

        try {
            $client->mintToken('user-1');
            self::fail('expected a ClientException');
        } catch (\Mio\Realtime\ClientException $e) {
            self::assertSame('UNAUTHORIZED', $e->getErrorCode());
            self::assertSame(401, $e->getHttpStatus());
        }
    }
}
