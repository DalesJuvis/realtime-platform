/**
 * client.test.js — covers what's actually testable about `mio-client.js`
 * without a live WebSocket server (see this package's README's "Statut
 * de validation" for what isn't): the UTF-8 byte-length guard `publish()`
 * uses to reject an oversized payload before ever trying to send it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const MioRealtimeClient = require('../../assets/js/mio-client.js');
const MioProtocol = require('../../assets/js/mio-protocol.js');

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

/** A real `WebSocket` starts CONNECTING (readyState 0) and only becomes
 * OPEN (1) once `onopen` actually fires, asynchronously — this fake
 * mirrors that instead of resolving synchronously, to reproduce the exact
 * race a caller hits doing `client.connect(); client.replay(...)` back to
 * back (what `mio-shortcode.js`'s `data-mio-replay` wiring does). */
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
    const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
    client.connect();
    assert.doesNotThrow(() => client.replay('orders:42', 0));

    await new Promise((r) => setTimeout(r, 0));
    const opcodes = client._ws.sent.map((frame) => frame[2]);
    assert.deepEqual(opcodes, [MioProtocol.Opcode.Auth, MioProtocol.Opcode.Replay]);
    client.disconnect();
  } finally {
    global.WebSocket = realWebSocket;
  }
});

test('publish() called synchronously right after connect() does not throw, and is sent once the socket actually opens', async () => {
  const realWebSocket = global.WebSocket;
  global.WebSocket = SlowOpeningFakeWebSocket;
  try {
    const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
    client.connect();
    // The exact reported bug: connect() then publish() back to back, the
    // pattern this package's own README/DOCS.md quick-start shows.
    assert.doesNotThrow(() => client.publish('orders:42', 'order created'));

    await new Promise((r) => setTimeout(r, 0));
    const opcodes = client._ws.sent.map((frame) => frame[2]);
    assert.deepEqual(opcodes, [MioProtocol.Opcode.Auth, MioProtocol.Opcode.Publish]);
    client.disconnect();
  } finally {
    global.WebSocket = realWebSocket;
  }
});

// Background notifications: no `window`/`Notification`/`document` in plain
// Node, so what's testable here (same boundary as the rest of this file —
// see its own doc comment) is the unsupported-environment behavior: these
// must degrade to safe no-ops rather than throwing "Notification is not
// defined" just because the module was required outside a browser.

test('isNotificationSupported is false in a plain Node environment', () => {
  assert.equal(MioRealtimeClient.isNotificationSupported(), false);
});

test('requestNotificationPermission resolves to "denied" without touching a global Notification', async () => {
  const permission = await MioRealtimeClient.requestNotificationPermission();
  assert.equal(permission, 'denied');
});

test('attachBackgroundNotifications is a no-op (returns an unsubscribe that does nothing) when unsupported', () => {
  const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
  const unsubscribe = MioRealtimeClient.attachBackgroundNotifications(client, {});
  assert.equal(typeof unsubscribe, 'function');
  assert.doesNotThrow(() => unsubscribe());
});

/** Minimal fake `Notification`/`window`/`document` — just enough surface
 * for attachBackgroundNotifications()'s actual logic (permission check,
 * visibility/focus gate, title/body defaults, onclick) to run for real,
 * rather than only exercising the unsupported-environment fallback above. */
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
    const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
    MioRealtimeClient.attachBackgroundNotifications(client);

    client._emit('message', { channelId: 'orders:42', payload: 'order created' });

    assert.equal(created.length, 1);
    assert.equal(created[0].title, 'orders:42');
    assert.equal(created[0].body, 'order created');
  });
});

test('attachBackgroundNotifications respects custom title/body/filter and stops notifying after unsubscribe', () => {
  withFakeNotificationGlobals((created) => {
    const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
    const unsubscribe = MioRealtimeClient.attachBackgroundNotifications(client, {
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

test('attachBackgroundNotifications does not notify when the tab is visible and focused', () => {
  const created = [];
  class FakeNotification {
    constructor() {
      created.push(this);
    }
  }
  FakeNotification.permission = 'granted';
  const realWindow = global.window;
  const realDocument = global.document;
  const realNotification = global.Notification;
  global.window = { focus: () => {} };
  global.document = { visibilityState: 'visible', hasFocus: () => true };
  global.Notification = FakeNotification;
  try {
    const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
    MioRealtimeClient.attachBackgroundNotifications(client);
    client._emit('message', { channelId: 'orders:42', payload: 'order created' });
    assert.equal(created.length, 0);
  } finally {
    global.window = realWindow;
    global.document = realDocument;
    global.Notification = realNotification;
  }
});

test('attachBackgroundNotifications does not notify without granted permission', () => {
  withFakeNotificationGlobals((created, FakeNotification) => {
    FakeNotification.permission = 'default';
    const client = new MioRealtimeClient({ wsUrl: 'wss://example.com/ws', tenantId: '12345678-9abc-def0-1122-334455667788', token: 't' });
    MioRealtimeClient.attachBackgroundNotifications(client);
    client._emit('message', { channelId: 'orders:42', payload: 'order created' });
    assert.equal(created.length, 0);
  });
});
