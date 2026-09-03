/**
 * mio-vapid-subscription.js — a single, dependency-free file that
 * registers a visitor's browser for real Web Push (VAPID): notifications
 * with the tab or browser fully closed. Same "paste it in, no build step"
 * family as `mio-embed.js`, but for push registration instead of a live
 * feed — every credential is a property, either on this `<script>` tag's
 * own `data-*` attributes or passed to `subscribe()`/`unsubscribe()`
 * directly, nothing hardcoded in this file.
 *
 * ## Why registration can't auto-run on page load
 * `Notification.requestPermission()` only works from inside a user
 * gesture (a click) in effectively every browser — a page that requests
 * it on load either gets silently ignored or (worse) trains visitors to
 * reflexively dismiss the prompt. So unlike `mio-embed.js`'s live feed,
 * this file never subscribes anyone on its own. Give it `data-button`
 * (a CSS selector) and it wires that element's click for you; omit it and
 * call `window.MioVapidSubscription.subscribe(options)` yourself from
 * whatever gesture makes sense on your page.
 *
 * ## Why this can't mint its own token
 * Same boundary as `mio-embed.js`: a script running in a visitor's
 * browser can never safely hold your tenant secret. This file only ever
 * accepts an already-minted `data-token`/`options.token` — get one from
 * your tenant portal's Overview page ("Mint token"), scoped to a
 * low-privilege `sub` (e.g. `"public-push"`, not a real user) with a TTL
 * you're comfortable rotating on. A minted token is visible to anyone who
 * views this page's source once it's in a `data-token` attribute — that
 * is the honest trade-off of a zero-backend embed, not a bug, exactly as
 * exposed as a public API key.
 *
 * ## Usage — auto-wired button, zero JS to write
 * ```html
 * <script src="https://your-site.example/mio-vapid-subscription.js"
 *   data-api-base-url="https://mio.gabonnettoyage.online"
 *   data-tenant-id="12345678-9abc-def0-1122-334455667788"
 *   data-token="…"
 *   data-vapid-public-key="…"
 *   data-channels="orders:*"
 *   data-button="#enable-notifications"
 * ></script>
 * <button id="enable-notifications">Enable notifications</button>
 * ```
 * `data-channels` is a comma-separated list (defaults to `*`, every
 * channel). `data-sw-url` defaults to `/sw.js` (must already be deployed
 * on your own site — this file registers it, it doesn't create one for
 * you) and `data-device-label` defaults to a guessed "Chrome on Windows"-
 * style label. On success/failure this dispatches a `mio:vapid-subscribed`
 * / `mio:vapid-subscription-error` `CustomEvent` on the button element
 * (`event.detail.subscription` / `event.detail.error`) — listen for those
 * to show your own UI feedback instead of this file imposing one.
 *
 * ## Usage — call it yourself
 * ```html
 * <script src="https://your-site.example/mio-vapid-subscription.js"></script>
 * <script>
 *   document.getElementById('my-button').addEventListener('click', function () {
 *     window.MioVapidSubscription.subscribe({
 *       apiBaseUrl: 'https://mio.gabonnettoyage.online',
 *       tenantId: '…',
 *       token: '…',
 *       vapidPublicKey: '…',
 *       channels: ['orders:*'],
 *     }).then(function (result) {
 *       console.log('Subscribed', result.subscription.endpoint);
 *     }, function (err) {
 *       console.error(err);
 *     });
 *   });
 * </script>
 * ```
 *
 * Mirrors `registerWebPushSubscription()`/`unregisterWebPushSubscription()`
 * from `@mio/realtime-sdk` (`sdk-typescript/src/notifications.ts`) — same
 * behavior, translated to a dependency-free plain-`<script>` file for
 * sites with no build step, exactly like `mio-client.js` mirrors
 * `sdk-typescript/src/client.ts`.
 */
(function (global) {
  'use strict';

  function base64UrlToUint8Array(b64url) {
    var padded = b64url + new Array((4 - (b64url.length % 4)) % 4 + 1).join('=');
    var base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function arrayBufferToBase64Url(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function toSubscriptionInfo(subscription) {
    var p256dh = subscription.getKey('p256dh');
    var auth = subscription.getKey('auth');
    if (!p256dh || !auth) {
      throw new Error('Push subscription is missing p256dh/auth keys — the browser\'s PushManager returned an incomplete subscription.');
    }
    return {
      endpoint: subscription.endpoint,
      keys: { p256dh: arrayBufferToBase64Url(p256dh), auth: arrayBufferToBase64Url(auth) },
    };
  }

  function isNotificationSupported() {
    return typeof window !== 'undefined' && typeof Notification !== 'undefined';
  }

  /** Best-effort "Chrome on Windows"/"Safari on iPhone" label from
   * `navigator.userAgent` — see `guessDeviceLabel()` in
   * `sdk-typescript/src/notifications.ts` for the full rationale (no
   * detection library needed: a wrong guess is harmless, this is never
   * used for routing or a security decision). */
  function guessDeviceLabel() {
    if (typeof navigator === 'undefined') return 'Unknown device';
    var ua = navigator.userAgent;

    var os = null;
    if (/iPhone/.test(ua)) os = 'iPhone';
    else if (/iPad/.test(ua)) os = 'iPad';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Mac OS X/.test(ua)) os = 'Mac';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Linux/.test(ua)) os = 'Linux';

    var browser = null;
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    // Chrome's own user-agent also matches Safari's token, hence the order.
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/CriOS\//.test(ua)) browser = 'Chrome';
    else if (/FxiOS\//.test(ua)) browser = 'Firefox';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua)) browser = 'Safari';

    if (browser && os) return browser + ' on ' + os;
    return browser || os || 'Unknown device';
  }

  /**
   * Requests permission, registers `options.swUrl` (default `/sw.js`),
   * subscribes via `PushManager`, then registers the subscription with
   * your mio backend (`POST /api/v1/push/subscriptions`). Every
   * credential is a property on `options` — see this file's header doc
   * comment for the full shape. Rejects with a descriptive `Error` at
   * whichever step fails (permission denied, server rejection) rather
   * than failing silently.
   *
   * @param {object} options
   * @param {string} options.apiBaseUrl Base URL of your mio instance, no trailing slash.
   * @param {string} options.token Client bearer token — never your tenant secret.
   * @param {string} options.tenantId
   * @param {string} options.vapidPublicKey
   * @param {string[]} [options.channels] Default `['*']` (every channel).
   * @param {string} [options.swUrl] Default `'/sw.js'`.
   * @param {string} [options.deviceLabel] Default `guessDeviceLabel()`.
   * @returns {Promise<{subscription: object, registered: true}>}
   */
  function subscribe(options) {
    if (!isNotificationSupported() || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return Promise.reject(new Error('Web Push is not supported in this browser.'));
    }

    return Notification.requestPermission().then(function (permission) {
      if (permission !== 'granted') {
        throw new Error('Notification permission was "' + permission + '", not "granted".');
      }
      return navigator.serviceWorker.register(options.swUrl || '/sw.js');
    }).then(function (registration) {
      return registration.pushManager.getSubscription().then(function (existing) {
        if (existing) return existing;
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(options.vapidPublicKey),
        });
      });
    }).then(function (rawSubscription) {
      var subscription = toSubscriptionInfo(rawSubscription);
      return fetch(options.apiBaseUrl + '/api/v1/push/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + options.token },
        body: JSON.stringify({
          tenant_id: options.tenantId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          channels: options.channels || ['*'],
          device_label: options.deviceLabel || guessDeviceLabel(),
        }),
      }).then(function (res) {
        if (!res.ok) throw new Error('Push subscription registration failed (' + res.status + ').');
        return { subscription: subscription, registered: true };
      });
    });
  }

  /**
   * Resolves the active subscription (if any) and removes it, both from
   * the browser and from your mio backend. Resolves `false` without any
   * network call if there was nothing to unsubscribe.
   *
   * @param {object} options
   * @param {string} options.apiBaseUrl
   * @param {string} options.token
   * @param {string} options.tenantId
   * @param {string} [options.swUrl] Default `'/sw.js'`.
   * @returns {Promise<boolean>}
   */
  function unsubscribe(options) {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return Promise.resolve(false);
    }
    return navigator.serviceWorker.register(options.swUrl || '/sw.js').then(function (registration) {
      return registration.pushManager.getSubscription().then(function (existing) {
        if (!existing) return false;
        var endpoint = existing.endpoint;
        return existing.unsubscribe().then(function () {
          return fetch(options.apiBaseUrl + '/api/v1/push/subscriptions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + options.token },
            body: JSON.stringify({ tenant_id: options.tenantId, endpoint: endpoint }),
          }).then(function (res) {
            if (!res.ok) throw new Error('Push subscription removal failed (' + res.status + ').');
            return true;
          });
        });
      });
    });
  }

  // ===========================================================================
  // Auto-init — reads this <script> tag's own data-* attributes and, if
  // data-button resolves to an element, wires its click to subscribe().
  // Never runs outside a browser (no `document`), and never runs without
  // the required attributes — importing this file for its exports below
  // without configuring it is inert, same guarantee as mio-embed.js.
  //
  // Waits for DOMContentLoaded before looking up data-button when the
  // document is still loading: a script pasted in <head> (the placement
  // this file's own docs recommend, matching mio-embed.js's convention)
  // executes before <body>'s button element exists yet. An earlier
  // version looked the button up immediately and silently gave up if it
  // wasn't there yet — no error, no event, just a click handler that was
  // never attached. This is why it now waits instead of guessing.
  // ===========================================================================
  function autoInit() {
    if (typeof document === 'undefined' || !document.currentScript) return;
    var script = document.currentScript;
    var ds = script.dataset || {};
    if (!ds.apiBaseUrl || !ds.tenantId || !ds.token || !ds.vapidPublicKey || !ds.button) return;

    var options = {
      apiBaseUrl: ds.apiBaseUrl,
      tenantId: ds.tenantId,
      token: ds.token,
      vapidPublicKey: ds.vapidPublicKey,
      channels: ds.channels ? ds.channels.split(',').map(function (c) { return c.trim(); }) : ['*'],
      swUrl: ds.swUrl || '/sw.js',
      deviceLabel: ds.deviceLabel || undefined,
    };

    function wireButton() {
      var button = document.querySelector(ds.button);
      if (!button) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('mio-vapid-subscription.js: data-button "' + ds.button + '" matched no element — nothing wired.');
        }
        return;
      }
      button.addEventListener('click', function () {
        subscribe(options).then(function (result) {
          button.dispatchEvent(new CustomEvent('mio:vapid-subscribed', { bubbles: true, detail: result }));
        }, function (err) {
          button.dispatchEvent(new CustomEvent('mio:vapid-subscription-error', { bubbles: true, detail: { error: err } }));
        });
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireButton);
    } else {
      wireButton();
    }
  }

  var exportsObject = {
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    guessDeviceLabel: guessDeviceLabel,
    isNotificationSupported: isNotificationSupported,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObject;
  } else {
    global.MioVapidSubscription = exportsObject;
    autoInit();
  }
})(typeof self !== 'undefined' ? self : this);
