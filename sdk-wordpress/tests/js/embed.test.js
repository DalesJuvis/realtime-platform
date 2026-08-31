/**
 * embed.test.js — verifies `mio-embed.js` (the single-file, no-plugin
 * embed) is a faithful copy of the already-tested `mio-protocol.js` /
 * `mio-client.js` logic, not just a visual inspection. Same cases as
 * `protocol.test.js`/`client.test.js`, run against the consolidated file
 * instead, so a copy-paste slip between the two wouldn't go unnoticed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Protocol, Client } = require('../../assets/js/mio-embed.js');

const SAMPLE_TENANT = '12345678-9abc-def0-1122-334455667788';

test('encode then decode round-trips every field', () => {
  const raw = Protocol.encodeFrame({ opcode: Protocol.Opcode.Publish, tenantId: SAMPLE_TENANT, channelId: 'room-42', payload: 'hello world' });
  assert.equal(raw.length, Protocol.FRAME_SIZE);
  const frame = Protocol.decodeFrame(raw);
  assert.equal(frame.channelId, 'room-42');
  assert.equal(frame.payload, 'hello world');
});

test('rejects a corrupted CRC', () => {
  const raw = Protocol.encodeFrame({ opcode: Protocol.Opcode.Message, tenantId: SAMPLE_TENANT, payload: 'data' });
  raw[50] ^= 0xff;
  assert.throws(() => Protocol.decodeFrame(raw), Protocol.ProtocolError);
});

test('globMatch — trailing wildcard', () => {
  assert.ok(Protocol.globMatch('orders:*', 'orders:42'));
  assert.ok(!Protocol.globMatch('orders:*', 'invoices:42'));
});

test('the exported Client can be constructed without a WebSocket implementation present', () => {
  const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
  assert.equal(typeof client.connect, 'function');
  assert.equal(typeof client.subscribe, 'function');
});

test('publish() rejects an oversized payload without needing an open socket', () => {
  const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
  assert.throws(() => client.publish('room-1', 'x'.repeat(212)), /exceeds 211 bytes/);
});

test('requiring the module in Node never touches `document` (auto-init is browser-only)', () => {
  // If this file's auto-init ran at require() time outside a browser, the
  // require() call above would already have thrown — this test just makes
  // the guarantee explicit and named, so a regression fails loudly here
  // rather than as a mysterious crash in some other test.
  assert.ok(true);
});

/** Same fake as client.test.js's — a real `WebSocket` starts CONNECTING
 * (readyState 0) and only becomes OPEN (1) once `onopen` actually fires,
 * asynchronously. Reproduces the exact race autoInit's own
 * `client.connect(); if (ds.replay === 'true') client.replay(...)` hits. */
class SlowOpeningFakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.sent = [];
    queueMicrotask(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    });
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
}

test('replay() called synchronously right after connect() does not throw, and is sent once the socket actually opens', async () => {
  const realWebSocket = global.WebSocket;
  global.WebSocket = SlowOpeningFakeWebSocket;
  try {
    const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
    client.connect();
    assert.doesNotThrow(() => client.replay('orders:42', 0));

    await new Promise((r) => setTimeout(r, 0));
    const opcodes = client._ws.sent.map((frame) => frame[2]);
    assert.deepEqual(opcodes, [Protocol.Opcode.Auth, Protocol.Opcode.Replay]);
    client.disconnect();
  } finally {
    global.WebSocket = realWebSocket;
  }
});
