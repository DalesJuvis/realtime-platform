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

test('publish() called synchronously right after connect() does not throw, and is sent once the socket actually opens', async () => {
  const realWebSocket = global.WebSocket;
  global.WebSocket = SlowOpeningFakeWebSocket;
  try {
    const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
    client.connect();
    // The exact bug reported live: mio-protocol.js + mio-client.js loaded
    // as separate <script> tags, then connect() immediately followed by
    // publish() — the pattern this package's own docs show.
    assert.doesNotThrow(() => client.publish('orders:42', 'order created'));

    await new Promise((r) => setTimeout(r, 0));
    const opcodes = client._ws.sent.map((frame) => frame[2]);
    assert.deepEqual(opcodes, [Protocol.Opcode.Auth, Protocol.Opcode.Publish]);
    client.disconnect();
  } finally {
    global.WebSocket = realWebSocket;
  }
});

// Background notifications — same cases as client.test.js, run against the
// consolidated file (this suite's whole purpose, see its own doc comment).

test('isNotificationSupported is false in a plain Node environment', () => {
  assert.equal(Client.isNotificationSupported(), false);
});

test('requestNotificationPermission resolves to "denied" without touching a global Notification', async () => {
  const permission = await Client.requestNotificationPermission();
  assert.equal(permission, 'denied');
});

test('attachBackgroundNotifications is a no-op (returns an unsubscribe that does nothing) when unsupported', () => {
  const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
  const unsubscribe = Client.attachBackgroundNotifications(client, {});
  assert.equal(typeof unsubscribe, 'function');
  assert.doesNotThrow(() => unsubscribe());
});

function withFakeNotificationGlobals(fn) {
  const created = [];
  class FakeNotification {
    constructor(title, options) {
      this.title = title;
      this.body = options && options.body;
      this.icon = options && options.icon;
      this.onclick = null;
      created.push(this);
    }
  }
  FakeNotification.permission = 'granted';

  const realWindow = global.window;
  const realDocument = global.document;
  const realNotification = global.Notification;
  global.window = { focus: () => {} };
  global.document = { visibilityState: 'hidden', hasFocus: () => false };
  global.Notification = FakeNotification;
  try {
    return fn(created, FakeNotification);
  } finally {
    global.window = realWindow;
    global.document = realDocument;
    global.Notification = realNotification;
  }
}

test('attachBackgroundNotifications shows a notification (title/body defaults) for a message while hidden and permission granted', () => {
  withFakeNotificationGlobals((created) => {
    const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
    Client.attachBackgroundNotifications(client);

    client._emit('message', { channelId: 'orders:42', payload: 'order created' });

    assert.equal(created.length, 1);
    assert.equal(created[0].title, 'orders:42');
    assert.equal(created[0].body, 'order created');
  });
});

test('attachBackgroundNotifications respects custom title/body/filter and stops notifying after unsubscribe', () => {
  withFakeNotificationGlobals((created) => {
    const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
    const unsubscribe = Client.attachBackgroundNotifications(client, {
      filter: (m) => m.channelId === 'orders:42',
      title: (m) => 'New on ' + m.channelId,
      body: (m) => m.payload.toUpperCase(),
    });

    client._emit('message', { channelId: 'invoices:1', payload: 'ignored' });
    assert.equal(created.length, 0, 'filtered out, no notification');

    client._emit('message', { channelId: 'orders:42', payload: 'order created' });
    assert.equal(created.length, 1);
    assert.equal(created[0].title, 'New on orders:42');
    assert.equal(created[0].body, 'ORDER CREATED');

    unsubscribe();
    client._emit('message', { channelId: 'orders:42', payload: 'order shipped' });
    assert.equal(created.length, 1, 'unsubscribed, no further notifications');
  });
});

test('attachBackgroundNotifications does not notify without granted permission', () => {
  withFakeNotificationGlobals((created, FakeNotification) => {
    FakeNotification.permission = 'default';
    const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
    Client.attachBackgroundNotifications(client);
    client._emit('message', { channelId: 'orders:42', payload: 'order created' });
    assert.equal(created.length, 0);
  });
});

test('showBackgroundNotification called directly from a subscribe() callback shows a notification', () => {
  withFakeNotificationGlobals((created) => {
    const client = new Client({ wsUrl: 'wss://example.com/ws', tenantId: SAMPLE_TENANT, token: 't' });
    const unsubscribe = client.subscribe('orders:42', (message) => {
      Client.showBackgroundNotification(message);
    });

    client._dispatch({ channelId: 'orders:42', payload: 'order created', tenantId: SAMPLE_TENANT });

    assert.equal(created.length, 1);
    assert.equal(created[0].title, 'orders:42');
    assert.equal(created[0].body, 'order created');
    unsubscribe();
  });
});

test('showBackgroundNotification is a no-op when unsupported (no window/Notification global)', () => {
  assert.doesNotThrow(() => Client.showBackgroundNotification({ channelId: 'orders:42', payload: 'order created' }));
});

// authFailed — same cases as client.test.js, run against the consolidated file.

test('authFailed fires and no reconnect is attempted on the server\'s auth-failure close code', async () => {
  const realWebSocket = global.WebSocket;
  let constructCount = 0;
  let latestWs;
  class CountingFakeWebSocket extends SlowOpeningFakeWebSocket {
    constructor(url) {
      super(url);
      constructCount++;
      latestWs = this;
    }
  }
  global.WebSocket = CountingFakeWebSocket;
  try {
    const client = new Client({
      wsUrl: 'wss://example.com/ws',
      tenantId: SAMPLE_TENANT,
      token: 't',
      reconnect: true,
      reconnectBaseDelayMs: 5,
      reconnectMaxDelayMs: 5,
    });
    const authFailedEvents = [];
    client.on('authFailed', (e) => authFailedEvents.push(e));

    client.connect();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(constructCount, 1);

    latestWs.onclose({ code: 4001, reason: 'authentication failed' });

    await new Promise((r) => setTimeout(r, 50));

    assert.deepEqual(authFailedEvents, [{ code: 4001, reason: 'authentication failed' }]);
    assert.equal(constructCount, 1, 'must not reconnect after an auth-failure close — same token would just fail again');
    client.disconnect();
  } finally {
    global.WebSocket = realWebSocket;
  }
});

test('a normal close still reconnects — auth-failure handling does not break the general case', async () => {
  const realWebSocket = global.WebSocket;
  let constructCount = 0;
  let latestWs;
  class CountingFakeWebSocket extends SlowOpeningFakeWebSocket {
    constructor(url) {
      super(url);
      constructCount++;
      latestWs = this;
    }
  }
  global.WebSocket = CountingFakeWebSocket;
  try {
    const client = new Client({
      wsUrl: 'wss://example.com/ws',
      tenantId: SAMPLE_TENANT,
      token: 't',
      reconnect: true,
      reconnectBaseDelayMs: 5,
      reconnectMaxDelayMs: 5,
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(constructCount, 1);

    latestWs.onclose({ code: 1006, reason: '' });

    await new Promise((r) => setTimeout(r, 50));

    assert.equal(constructCount, 2, 'a non-auth-failure close must still trigger the normal reconnect');
    client.disconnect();
  } finally {
    global.WebSocket = realWebSocket;
  }
});
