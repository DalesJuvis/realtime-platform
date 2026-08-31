/**
 * client.test.js — covers what's actually testable about `mio-client.js`
 * without a live WebSocket server (see this package's README's "Statut
 * de validation" for what isn't): the UTF-8 byte-length guard `publish()`
 * uses to reject an oversized payload before ever trying to send it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const MioRealtimeClient = require('../../assets/js/mio-client.js');

const encodeUtf8Length = MioRealtimeClient._encodeUtf8Length;
const textEncoder = new TextEncoder();

function assertMatchesRealEncoder(s) {
  assert.equal(encodeUtf8Length(s), textEncoder.encode(s).length, JSON.stringify(s));
}

test('encodeUtf8Length matches TextEncoder for ASCII', () => {
  assertMatchesRealEncoder('hello world');
  assertMatchesRealEncoder('');
});

test('encodeUtf8Length matches TextEncoder for 2-byte (Latin-1 accented) characters', () => {
  assertMatchesRealEncoder('café résumé');
});

test('encodeUtf8Length matches TextEncoder for 3-byte characters', () => {
  assertMatchesRealEncoder('€'.repeat(10));
  assertMatchesRealEncoder('日本語');
});

test('encodeUtf8Length matches TextEncoder for 4-byte characters (surrogate pairs)', () => {
  assertMatchesRealEncoder('😀😀😀');
  assertMatchesRealEncoder('a😀b€c');
});

test('the module can be constructed without a WebSocket implementation present', () => {
  // require()ing/instantiating must not touch the `WebSocket` global —
  // only `.connect()` does, which this test deliberately never calls.
  const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
  assert.equal(typeof client.connect, 'function');
  assert.equal(typeof client.subscribe, 'function');
});

test('publish() rejects an oversized payload without needing an open socket', () => {
  const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
  assert.throws(() => client.publish('room-1', 'x'.repeat(212)), /exceeds 211 bytes/);
});
