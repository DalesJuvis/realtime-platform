<?php
/**
 * ClientTest — real PHPUnit tests against `Client`, no WordPress needed
 * (see `HttpTransport`'s doc comment for why: `Client` never calls a
 * `wp_*` function itself). This is the one part of this plugin that
 * actually runs and passes in the environment it was written in — see
 * the package README's "Statut de validation" for what the
 * WordPress-integration classes (`RestController`, `Shortcode`,
 * `AdminPage`) still need verified against a real WordPress install.
 */

namespace Mio\Realtime\Tests;

use Mio\Realtime\Client;
use Mio\Realtime\ClientException;
use Mio\Realtime\HttpResponse;
use PHPUnit\Framework\TestCase;

final class ClientTest extends TestCase
{
    private function jsonResponse($status, array $body)
    {
        return new HttpResponse($status, (string) json_encode($body));
    }

    public function testMintTokenParsesTokenAndExpiresIn()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('token' => 'signed.token.value', 'expires_in' => 3600, 'ws_url' => 'wss://realtime.example.com/ws'),
            'trace_id' => 'abc',
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'super-secret', $transport);

        $minted = $client->mintToken('user-42');

        self::assertSame('signed.token.value', $minted->token);
        self::assertSame(3600, $minted->expiresIn);
        self::assertSame('wss://realtime.example.com/ws', $minted->wsUrl);
    }

    public function testMintTokenSendsSecretOnlyToAuthEndpointNeverAgain()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('token' => 't', 'expires_in' => 3600, 'ws_url' => 'wss://realtime.example.com/ws'),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'super-secret', $transport);
        $client->mintToken('user-42', 900);

        self::assertCount(1, $transport->requests);
        $req = $transport->requests[0];
        self::assertSame('https://realtime.example.com:8090/api/v1/auth/tokens', $req['url']);
        $body = json_decode($req['body'], true);
        self::assertSame('tenant-1', $body['tenant_id']);
        self::assertSame('super-secret', $body['secret']);
        self::assertSame('user-42', $body['sub']);
        self::assertSame(900, $body['ttl_secs']);
        self::assertArrayNotHasKey('Authorization', $req['headers']);
    }

    public function testPublishSendsBearerTokenNeverTheSecret()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('published' => true),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'super-secret', $transport);

        $ok = $client->publish('orders:42', 'order created', 'a-client-token');

        self::assertTrue($ok);
        $req = $transport->requests[0];
        self::assertSame('https://realtime.example.com:8090/api/v1/messages', $req['url']);
        self::assertSame('Bearer a-client-token', $req['headers']['Authorization']);
        $body = json_decode($req['body'], true);
        self::assertSame('orders:42', $body['channel_id']);
        self::assertSame('order created', $body['payload']);
        self::assertArrayNotHasKey('secret', $body);
    }

    public function testTrailingSlashOnApiUrlIsNormalized()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('token' => 't', 'expires_in' => 3600, 'ws_url' => 'wss://realtime.example.com/ws'),
        )));
        $client = new Client('https://realtime.example.com:8090/', 'tenant-1', 'secret', $transport);
        $client->mintToken('user-1');

        self::assertSame('https://realtime.example.com:8090/api/v1/auth/tokens', $transport->requests[0]['url']);
    }

    public function testPublishRejectsOversizedPayloadWithoutAnyNetworkCall()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array('success' => true, 'data' => array())));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        $this->expectException(ClientException::class);
        try {
            $client->publish('orders:42', str_repeat('x', 212), 'token');
        } finally {
            self::assertCount(0, $transport->requests, 'must fail before any HTTP call');
        }
    }

    public function testPublishRejectsOversizedChannelId()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array('success' => true, 'data' => array())));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        $this->expectException(ClientException::class);
        $this->expectExceptionMessage('channel_id exceeds 24 bytes');
        $client->publish(str_repeat('c', 25), 'hi', 'token');
    }

    public function testApiErrorEnvelopeIsSurfacedAsClientException()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(401, array(
            'success' => false,
            'error' => array('code' => 'UNAUTHORIZED', 'message' => 'invalid tenant secret', 'trace_id' => 'xyz'),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'wrong-secret', $transport);

        try {
            $client->mintToken('user-1');
            self::fail('expected a ClientException');
        } catch (ClientException $e) {
            self::assertSame('UNAUTHORIZED', $e->getErrorCode());
            self::assertSame('invalid tenant secret', $e->getMessage());
            self::assertSame(401, $e->getHttpStatus());
        }
    }

    public function testMalformedJsonResponseIsSurfacedAsClientException()
    {
        $transport = new FakeHttpTransport(new HttpResponse(200, 'not json'));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        $this->expectException(ClientException::class);
        $client->mintToken('user-1');
    }

    public function testMintTokenOmitsTtlWhenNotProvided()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('token' => 't', 'expires_in' => 3600, 'ws_url' => 'wss://realtime.example.com/ws'),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);
        $client->mintToken('user-1');

        $body = json_decode($transport->requests[0]['body'], true);
        self::assertArrayNotHasKey('ttl_secs', $body);
    }

    public function testEmitEventEncodesEventAndDataAsThePayload()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('published' => true),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        $ok = $client->emitEvent('orders:42', 'order.created', 'a-client-token', array('orderId' => 7));

        self::assertTrue($ok);
        $req = $transport->requests[0];
        $body = json_decode($req['body'], true);
        $payload = json_decode($body['payload'], true);
        self::assertSame('order.created', $payload['event']);
        self::assertSame(array('orderId' => 7), $payload['data']);
    }

    public function testEmitEventWithoutDataOmitsTheDataKeyEntirely()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('published' => true),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        $client->emitEvent('orders:42', 'ping', 'a-client-token');

        $req = $transport->requests[0];
        $body = json_decode($req['body'], true);
        $payload = json_decode($body['payload'], true);
        self::assertSame('ping', $payload['event']);
        self::assertArrayNotHasKey('data', $payload);
    }

    public function testEmitEventRejectsAnOversizedEncodedPayloadWithoutAnyNetworkCall()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array('success' => true, 'data' => array())));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        $this->expectException(ClientException::class);
        try {
            $client->emitEvent('orders:42', 'big', 'token', array('text' => str_repeat('x', 250)));
        } finally {
            self::assertCount(0, $transport->requests, 'must fail before any HTTP call, same as publish() itself');
        }
    }

    public function testPublishTemplateSendsBearerTokenTemplateIdAndVariables()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('published' => true),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'super-secret', $transport);

        $ok = $client->publishTemplate('orders:42', 'template-id-1', 'a-client-token', array('name' => 'Ada'));

        self::assertTrue($ok);
        $req = $transport->requests[0];
        self::assertSame('https://realtime.example.com:8090/api/v1/messages/template', $req['url']);
        self::assertSame('Bearer a-client-token', $req['headers']['Authorization']);
        $body = json_decode($req['body'], true);
        self::assertSame('tenant-1', $body['tenant_id']);
        self::assertSame('orders:42', $body['channel_id']);
        self::assertSame('template-id-1', $body['template_id']);
        self::assertSame(array('name' => 'Ada'), $body['variables']);
        self::assertArrayNotHasKey('secret', $body);
    }

    public function testPublishTemplateEncodesAnEmptyVariablesMapAsAJsonObjectNotAnArray()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array(
            'success' => true,
            'data' => array('published' => true),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        $client->publishTemplate('orders:42', 'template-id-1', 'a-client-token');

        $req = $transport->requests[0];
        self::assertStringContainsString('"variables":{}', $req['body']);
    }

    public function testPublishTemplateRejectsOversizedChannelIdWithoutAnyNetworkCall()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(200, array('success' => true, 'data' => array())));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        $this->expectException(ClientException::class);
        try {
            $client->publishTemplate(str_repeat('c', 25), 'template-id-1', 'token');
        } finally {
            self::assertCount(0, $transport->requests, 'must fail before any HTTP call');
        }
    }

    public function testPublishTemplateSurfacesTemplateNotFoundAsClientException()
    {
        $transport = new FakeHttpTransport($this->jsonResponse(404, array(
            'success' => false,
            'error' => array('code' => 'TEMPLATE_NOT_FOUND', 'message' => 'no such template', 'trace_id' => 'xyz'),
        )));
        $client = new Client('https://realtime.example.com:8090', 'tenant-1', 'secret', $transport);

        try {
            $client->publishTemplate('orders:42', 'missing-template', 'token');
            self::fail('expected a ClientException');
        } catch (ClientException $e) {
            self::assertSame('TEMPLATE_NOT_FOUND', $e->getErrorCode());
            self::assertSame(404, $e->getHttpStatus());
        }
    }
}
