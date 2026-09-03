/**
 * vapid-subscription.test.js — `mio-vapid-subscription.js` has no
 * protocol/crypto logic of its own (unlike `mio-embed.js`, which mirrors
 * `mio-protocol.js`/`mio-client.js`): it's a thin orchestration wrapper
 * around browser-only APIs (Notification, ServiceWorker, PushManager,
 * fetch). These tests cover what's actually testable in plain Node —
 * the pure `guessDeviceLabel()` logic, the auto-init guard, and that
 * `subscribe()`/`unsubscribe()` fail predictably outside a browser rather
 * than throwing something confusing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mio = require('../../assets/js/mio-vapid-subscription.js');

test('requiring the module in Node never touches `document` (auto-init is browser-only)', () => {
  // If this file's auto-init ran at require() time outside a browser, the
  // require() call above would already have thrown — this test just makes
  // the guarantee explicit and named, same convention as embed.test.js.
  assert.ok(true);
});

test('exports the documented shape', () => {
  assert.equal(typeof mio.subscribe, 'function');
  assert.equal(typeof mio.unsubscribe, 'function');
  assert.equal(typeof mio.guessDeviceLabel, 'function');
  assert.equal(typeof mio.isNotificationSupported, 'function');
});

test('isNotificationSupported is false in a plain Node environment', () => {
  assert.equal(mio.isNotificationSupported(), false);
});

test('subscribe() rejects with a clear error outside a browser', async () => {
  await assert.rejects(
    mio.subscribe({ apiBaseUrl: 'https://mio.example.com', tenantId: 't', token: 'x', vapidPublicKey: 'y' }),
    /not supported in this browser/,
  );
});

test('unsubscribe() resolves false outside a browser rather than throwing', async () => {
  const result = await mio.unsubscribe({ apiBaseUrl: 'https://mio.example.com', tenantId: 't', token: 'x' });
  assert.equal(result, false);
});

// Node 21+ defines a built-in, getter-only `navigator` global (its own
// `Node.js/<version>` user agent) — plain `global.navigator = {...}` is a
// silent no-op against a getter with no setter, so these tests replace
// the property descriptor instead, restoring the original afterward.
function withNavigator(navigatorValue, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: navigatorValue, configurable: true, writable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(globalThis, 'navigator', original);
  }
}

test('guessDeviceLabel combines browser and OS when both are detected', () => {
  withNavigator(
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    () => assert.equal(mio.guessDeviceLabel(), 'Chrome on Windows'),
  );
});

test('guessDeviceLabel recognizes Safari on iPhone', () => {
  withNavigator(
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
    () => assert.equal(mio.guessDeviceLabel(), 'Safari on iPhone'),
  );
});

test('guessDeviceLabel falls back to "Unknown device" when navigator is absent', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  delete globalThis.navigator;
  try {
    assert.equal(mio.guessDeviceLabel(), 'Unknown device');
  } finally {
    Object.defineProperty(globalThis, 'navigator', original);
  }
});
