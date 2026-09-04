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
 * ## Usage — popup card, zero JS to write, zero button to build
 * ```html
 * <script src="https://your-site.example/mio-vapid-subscription.js"
 *   data-mode="popup"
 *   data-api-base-url="https://mio.gabonnettoyage.online"
 *   data-tenant-id="12345678-9abc-def0-1122-334455667788"
 *   data-token="…"
 *   data-vapid-public-key="…"
 *   data-channels="orders:*"
 *   data-title="Enable notifications?"
 *   data-description="Get notified about new orders."
 *   data-confirm-label="Enable"
 *   data-accent-color="#FF5E1A"
 *   data-theme="light"
 *   data-position="bottom-right"
 *   data-reprompt-interval-days="3"
 * ></script>
 * ```
 * A small floating card (in the spirit of a "Sign in with Google" account
 * chooser — compact, one gesture, a clear loading state) appears once
 * the DOM is ready — no `data-button`/pre-existing element needed. If the
 * visitor dismisses it (× or Escape), `data-reprompt-interval-days` sets
 * how long before it's shown again on a later visit (mirrors the
 * `repromptIntervalDays` option of `showPopup()`, same defaults: `0` /
 * omitted never re-shows once dismissed). Renders nothing at all if
 * permission is already `"granted"`/`"denied"`. Call
 * `window.MioVapidSubscription.showPopup(options)` yourself instead of
 * `data-mode="popup"` for full control over *when* it appears (e.g. after
 * a delay, or on a specific page only).
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

  var DISMISSED_AT_KEY_PREFIX = 'mio_push_popup_dismissed_at:';

  function dismissedAtKey(tenantId) {
    return DISMISSED_AT_KEY_PREFIX + tenantId;
  }

  function readDismissedAt(tenantId) {
    try {
      var raw = window.localStorage.getItem(dismissedAtKey(tenantId));
      return raw ? Number(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeDismissedAt(tenantId) {
    try {
      window.localStorage.setItem(dismissedAtKey(tenantId), String(Date.now()));
    } catch (e) {
      // Storage unavailable — an unrecorded dismissal just reproposes the
      // popup sooner than intended, never a visible error.
    }
  }

  var POPUP_STYLE_ELEMENT_ID = 'mio-push-popup-styles';

  function ensurePopupStylesInjected() {
    if (document.getElementById(POPUP_STYLE_ELEMENT_ID)) return;
    var style = document.createElement('style');
    style.id = POPUP_STYLE_ELEMENT_ID;
    style.textContent =
      '@keyframes mio-push-popup-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }' +
      '@keyframes mio-push-popup-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }' +
      '.mio-push-popup-confirm:hover:not(:disabled) { filter: brightness(0.92); }' +
      '.mio-push-popup-dismiss:hover { opacity: 1 !important; }';
    document.head.appendChild(style);
  }

  function assignStyle(el, styles) {
    for (var key in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) el.style[key] = styles[key];
    }
  }

  /**
   * Shows a small floating card — in the spirit of the "Sign in with
   * Google" account chooser (compact card, one gesture, a clear loading
   * state) — instead of the browser's bare permission prompt with no
   * context. One click on the confirm button does everything: requests
   * permission, registers the service worker, subscribes, registers with
   * your backend (see `subscribe()`, which this is only a presentation
   * layer over).
   *
   * Renders nothing (returns an inert handle) if permission is already
   * `"granted"`/`"denied"`, or was dismissed less than
   * `options.repromptIntervalDays` days ago.
   *
   * @param {object} options Same shape as `subscribe()`, plus:
   * @param {string} [options.title] Default "Enable notifications?".
   * @param {string} [options.description] Default a generic explanation.
   * @param {string} [options.confirmLabel] Default "Enable".
   * @param {string} [options.dismissAriaLabel] Default "Dismiss".
   * @param {string} [options.accentColor] Default '#FF5E1A'.
   * @param {'light'|'dark'} [options.theme] Default 'light'.
   * @param {'bottom-right'|'bottom-left'|'top-right'|'top-left'} [options.position] Default 'bottom-right'.
   * @param {number} [options.repromptIntervalDays] Default 0 (never auto re-show once dismissed).
   * @returns {{close: function(): void}}
   */
  function showPopup(options) {
    var noop = { close: function () {} };
    if (typeof document === 'undefined' || !isNotificationSupported()) return noop;
    if (Notification.permission !== 'default') return noop;

    var repromptDays = options.repromptIntervalDays || 0;
    var dismissedAt = readDismissedAt(options.tenantId);
    if (dismissedAt !== null) {
      var intervalMs = repromptDays * 24 * 60 * 60 * 1000;
      if (intervalMs <= 0 || Date.now() - dismissedAt < intervalMs) return noop;
    }

    ensurePopupStylesInjected();

    var dark = options.theme === 'dark';
    var accent = options.accentColor || '#FF5E1A';
    var bg = dark ? '#1e1f26' : '#ffffff';
    var fg = dark ? '#f3f3f5' : '#1a1a1a';
    var muted = dark ? '#a3a3ab' : '#5f6368';
    var border = dark ? '#33343d' : '#e0e0e0';

    var pos = (options.position || 'bottom-right').split('-');
    var overlayStyle = { position: 'fixed', zIndex: '2147483000', margin: '16px' };
    overlayStyle[pos[0]] = '0';
    overlayStyle[pos[1]] = '0';

    var overlay = document.createElement('div');
    assignStyle(overlay, overlayStyle);

    var card = document.createElement('div');
    assignStyle(card, {
      width: '320px',
      maxWidth: 'calc(100vw - 32px)',
      background: bg,
      color: fg,
      border: '1px solid ' + border,
      borderRadius: '12px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      padding: '16px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      animation: 'mio-push-popup-in 0.2s ease-out',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
    });

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.textContent = '×';
    dismissBtn.setAttribute('aria-label', options.dismissAriaLabel || 'Dismiss');
    dismissBtn.className = 'mio-push-popup-dismiss';
    assignStyle(dismissBtn, {
      position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', lineHeight: '24px',
      textAlign: 'center', border: 'none', background: 'transparent', color: muted, fontSize: '18px',
      cursor: 'pointer', opacity: '0.7', padding: '0',
    });

    var row = document.createElement('div');
    assignStyle(row, { display: 'flex', gap: '12px', alignItems: 'flex-start', paddingRight: '20px' });

    var icon = document.createElement('div');
    icon.textContent = '🔔';
    assignStyle(icon, { fontSize: '24px', lineHeight: '1', flexShrink: '0' });

    var textCol = document.createElement('div');
    assignStyle(textCol, { minWidth: '0' });

    var titleEl = document.createElement('p');
    titleEl.textContent = options.title || 'Enable notifications?';
    assignStyle(titleEl, { margin: '0 0 4px', fontSize: '14px', fontWeight: '600' });

    var descEl = document.createElement('p');
    descEl.textContent = options.description || 'Get notified about new activity, even when this tab is closed.';
    assignStyle(descEl, { margin: '0', fontSize: '13px', color: muted, lineHeight: '1.4' });

    textCol.appendChild(titleEl);
    textCol.appendChild(descEl);
    row.appendChild(icon);
    row.appendChild(textCol);

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'mio-push-popup-confirm';
    confirmBtn.textContent = options.confirmLabel || 'Enable';
    assignStyle(confirmBtn, {
      marginTop: '14px', width: '100%', border: 'none', borderRadius: '999px', background: accent,
      color: '#ffffff', fontSize: '14px', fontWeight: '600', padding: '10px 16px', cursor: 'pointer',
    });

    var progress = document.createElement('div');
    assignStyle(progress, {
      position: 'absolute', top: '0', left: '0', right: '0', height: '3px', overflow: 'hidden',
      background: 'transparent', display: 'none',
    });
    var progressBar = document.createElement('div');
    assignStyle(progressBar, {
      width: '40%', height: '100%', background: accent,
      animation: 'mio-push-popup-indeterminate 1s linear infinite',
    });
    progress.appendChild(progressBar);

    card.appendChild(progress);
    card.appendChild(dismissBtn);
    card.appendChild(row);
    card.appendChild(confirmBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    confirmBtn.focus();

    function remove() {
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKeyDown);
    }

    function dismiss() {
      writeDismissedAt(options.tenantId);
      remove();
      if (options.onDismiss) options.onDismiss();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') dismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    dismissBtn.addEventListener('click', dismiss);

    confirmBtn.addEventListener('click', function () {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '…';
      dismissBtn.style.display = 'none';
      progress.style.display = 'block';

      subscribe(options).then(function (result) {
        remove();
        if (options.onSubscribed) options.onSubscribed(result);
      }, function (err) {
        progress.style.display = 'none';
        confirmBtn.disabled = false;
        confirmBtn.textContent = options.confirmLabel || 'Enable';
        dismissBtn.style.display = '';
        descEl.textContent = err && err.message ? err.message : String(err);
        descEl.style.color = dark ? '#ff8a8a' : '#c5221f';
        if (options.onError) options.onError(err);
      });
    });

    return { close: remove };
  }

  // ===========================================================================
  // Auto-init — reads this <script> tag's own data-* attributes. Two
  // modes, data-mode="button" (default) or data-mode="popup":
  // - "button": wires data-button's click to subscribe(), same as before.
  // - "popup": shows the floating card (showPopup()) once the DOM is
  //   ready — no data-button needed, this is the "no JS to write" path
  //   for the popup style.
  // Never runs outside a browser (no `document`), and never runs without
  // the required credentials — importing this file for its exports below
  // without configuring it is inert, same guarantee as mio-embed.js.
  //
  // Waits for DOMContentLoaded before touching the DOM when the document
  // is still loading: a script pasted in <head> (the placement this
  // file's own docs recommend, matching mio-embed.js's convention)
  // executes before <body>'s button element exists yet. An earlier
  // version looked the button up immediately and silently gave up if it
  // wasn't there yet — no error, no event, just a click handler that was
  // never attached. This is why it now waits instead of guessing.
  // ===========================================================================
  function autoInit() {
    if (typeof document === 'undefined' || !document.currentScript) return;
    var script = document.currentScript;
    var ds = script.dataset || {};
    if (!ds.apiBaseUrl || !ds.tenantId || !ds.token || !ds.vapidPublicKey) return;

    var mode = ds.mode || 'button';
    if (mode === 'button' && !ds.button) return;

    var options = {
      apiBaseUrl: ds.apiBaseUrl,
      tenantId: ds.tenantId,
      token: ds.token,
      vapidPublicKey: ds.vapidPublicKey,
      channels: ds.channels ? ds.channels.split(',').map(function (c) { return c.trim(); }) : ['*'],
      swUrl: ds.swUrl || '/sw.js',
      deviceLabel: ds.deviceLabel || undefined,
      title: ds.title || undefined,
      description: ds.description || undefined,
      confirmLabel: ds.confirmLabel || undefined,
      dismissAriaLabel: ds.dismissAriaLabel || undefined,
      accentColor: ds.accentColor || undefined,
      theme: ds.theme || undefined,
      position: ds.position || undefined,
      repromptIntervalDays: ds.repromptIntervalDays ? Number(ds.repromptIntervalDays) : undefined,
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

    function init() {
      if (mode === 'popup') showPopup(options);
      else wireButton();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  var exportsObject = {
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    guessDeviceLabel: guessDeviceLabel,
    isNotificationSupported: isNotificationSupported,
    showPopup: showPopup,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObject;
  } else {
    global.MioVapidSubscription = exportsObject;
    autoInit();
  }
})(typeof self !== 'undefined' ? self : this);
