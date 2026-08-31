/**
 * mio-embed.js — a single, dependency-free file for pasting straight into
 * a WordPress site (a theme's "Insert Headers and Footers" area, a Custom
 * HTML block, footer.php) with no plugin install, no PHP, no build step.
 * Everything `mio-protocol.js` + `mio-client.js` do, inlined into one
 * file, plus auto-init from the `<script>` tag's own `data-*` attributes.
 *
 * ## Why this can't mint its own token
 * A script running in a visitor's browser can never safely hold your
 * tenant secret — anyone can view page source. This file only ever
 * accepts an already-minted `data-token`, the same boundary every other
 * SDK in this family enforces. Get one from your tenant portal's
 * Overview page ("Mint token") or, if you also run the full WordPress
 * plugin (`sdk-wordpress/`), its PHP `Client::mintToken()` — never
 * generate a token by hand or embed your tenant secret here.
 *
 * A minted token IS visible to anyone who views this page's source once
 * it's in a `data-token` attribute — that is the actual, honest trade-off
 * of a zero-backend embed, not a bug. It's exactly as exposed as a public
 * API key or a Stripe publishable key: mint one scoped to a low-privilege
 * `sub` (e.g. `"public-embed"`, not a real user), with a TTL you're
 * comfortable rotating on (`mintToken(sub, ttlSecs)` — see
 * `sdk-typescript`'s README §"Authentification HTTP avant connexion" for
 * the exact request shape), and swap it out on that schedule.
 *
 * ## Usage — auto-rendered feed, zero JS to write
 * ```html
 * <script src="https://your-site.example/mio-embed.js"
 *   data-ws-url="wss://mio.gabonnettoyage.online/ws"
 *   data-tenant-id="12345678-9abc-def0-1122-334455667788"
 *   data-token="…"
 *   data-channel="orders:42"
 *   data-limit="20"
 *   data-replay="true"
 * ></script>
 * <div id="my-feed"></div> <!-- optional: omit and one is created for you -->
 * ```
 * `data-target` (a CSS selector) points it at that `<div>` instead of
 * auto-creating one. Omit `data-token`/`data-channel` entirely to just
 * load `window.MioEmbedClient` (the constructor) without any auto-render,
 * for building your own UI — see the doc comment on it below.
 */
(function (global) {
  'use strict';

  // ===========================================================================
  // Protocol — encoder/decoder for the platform's fixed 256-byte binary frame.
  // Kept bit-for-bit identical to sdk-wordpress/assets/js/mio-protocol.js
  // (itself a mirror of sdk-typescript/src/protocol.ts / backend/src/protocol.rs)
  // — see that file for the full layout diagram and field-width rationale.
  // ===========================================================================
  var Protocol = (function () {
    var FRAME_SIZE = 256;
    var MAGIC = 0xaa01;

    var OFF_MAGIC = 0;
    var OFF_OPCODE = 2;
    var OFF_TENANT = 3;
    var LEN_TENANT = 16;
    var OFF_CHANNEL = OFF_TENANT + LEN_TENANT; // 19
    var LEN_CHANNEL = 24;
    var OFF_PAYLOAD = OFF_CHANNEL + LEN_CHANNEL; // 43
    var LEN_PAYLOAD = 211;
    var OFF_CRC = OFF_PAYLOAD + LEN_PAYLOAD; // 254
    var LEN_CRC = 2;

    if (OFF_CRC + LEN_CRC !== FRAME_SIZE) {
      throw new Error('mio-embed.js: frame layout inconsistent with FRAME_SIZE');
    }

    var Opcode = {
      Subscribe: 0x01,
      Publish: 0x02,
      Message: 0x03,
      Auth: 0x04,
      Ping: 0x05,
      Presence: 0x06,
      Replay: 0x07,
      Unicast: 0x08,
      Unsub: 0x09,
    };

    var VALID_OPCODES = {};
    Object.keys(Opcode).forEach(function (key) {
      VALID_OPCODES[Opcode[key]] = true;
    });

    function ProtocolError(message) {
      var err = Error.call(this, message);
      this.name = 'ProtocolError';
      this.message = message;
      this.stack = err.stack;
    }
    ProtocolError.prototype = Object.create(Error.prototype);
    ProtocolError.prototype.constructor = ProtocolError;

    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    function uuidToBytes(uuid) {
      if (!UUID_RE.test(uuid)) {
        throw new ProtocolError('invalid UUID: "' + uuid + '"');
      }
      var hex = uuid.replace(/-/g, '');
      var bytes = new Uint8Array(16);
      for (var i = 0; i < 16; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }

    function bytesToUuid(bytes) {
      var hex = '';
      for (var i = 0; i < bytes.length; i++) {
        hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
      }
      return (
        hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32)
      );
    }

    var textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    var textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

    function writePadded(dst, s) {
      dst.fill(0);
      var encoded = textEncoder.encode(s);
      var len = Math.min(encoded.length, dst.length);
      while (len > 0 && (encoded[len] & 0xc0) === 0x80) {
        len--;
      }
      dst.set(encoded.subarray(0, len));
    }

    function readTrimmed(src) {
      var end = src.indexOf(0);
      if (end === -1) end = src.length;
      return textDecoder.decode(src.subarray(0, end));
    }

    function crc16CcittFalse(data) {
      var crc = 0xffff;
      for (var i = 0; i < data.length; i++) {
        crc ^= data[i] << 8;
        for (var bit = 0; bit < 8; bit++) {
          crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
      }
      return crc & 0xffff;
    }

    function encodeFrame(fields) {
      var buf = new Uint8Array(FRAME_SIZE);
      var view = new DataView(buf.buffer);

      view.setUint16(OFF_MAGIC, MAGIC, false);
      buf[OFF_OPCODE] = fields.opcode;
      buf.set(uuidToBytes(fields.tenantId), OFF_TENANT);

      writePadded(buf.subarray(OFF_CHANNEL, OFF_CHANNEL + LEN_CHANNEL), fields.channelId || '');
      writePadded(buf.subarray(OFF_PAYLOAD, OFF_PAYLOAD + LEN_PAYLOAD), fields.payload || '');

      var crc = crc16CcittFalse(buf.subarray(0, OFF_CRC));
      view.setUint16(OFF_CRC, crc, false);

      return buf;
    }

    function decodeFrame(buf) {
      if (buf.length !== FRAME_SIZE) {
        throw new ProtocolError('invalid frame length: expected ' + FRAME_SIZE + ', got ' + buf.length);
      }

      var view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

      var magic = view.getUint16(OFF_MAGIC, false);
      if (magic !== MAGIC) {
        throw new ProtocolError('invalid magic/version: 0x' + magic.toString(16));
      }

      var opcodeByte = buf[OFF_OPCODE];
      if (!VALID_OPCODES[opcodeByte]) {
        throw new ProtocolError('unknown opcode: 0x' + opcodeByte.toString(16));
      }

      var expectedCrc = view.getUint16(OFF_CRC, false);
      var actualCrc = crc16CcittFalse(buf.subarray(0, OFF_CRC));
      if (expectedCrc !== actualCrc) {
        throw new ProtocolError('invalid CRC16: frame says 0x' + expectedCrc.toString(16) + ', computed 0x' + actualCrc.toString(16));
      }

      return {
        opcode: opcodeByte,
        tenantId: bytesToUuid(buf.subarray(OFF_TENANT, OFF_TENANT + LEN_TENANT)),
        channelId: readTrimmed(buf.subarray(OFF_CHANNEL, OFF_CHANNEL + LEN_CHANNEL)),
        payload: readTrimmed(buf.subarray(OFF_PAYLOAD, OFF_PAYLOAD + LEN_PAYLOAD)),
        raw: buf,
      };
    }

    function globMatch(pattern, candidate) {
      function helper(p, c) {
        if (p.length === 0) return c.length === 0;
        if (p[0] === '*') {
          for (var i = 0; i <= c.length; i++) {
            if (helper(p.slice(1), c.slice(i))) return true;
          }
          return false;
        }
        return c.length > 0 && c[0] === p[0] && helper(p.slice(1), c.slice(1));
      }
      return helper(pattern, candidate);
    }

    return {
      FRAME_SIZE: FRAME_SIZE,
      LEN_PAYLOAD: LEN_PAYLOAD,
      Opcode: Opcode,
      ProtocolError: ProtocolError,
      uuidToBytes: uuidToBytes,
      bytesToUuid: bytesToUuid,
      crc16CcittFalse: crc16CcittFalse,
      encodeFrame: encodeFrame,
      decodeFrame: decodeFrame,
      globMatch: globMatch,
    };
  })();

  // ===========================================================================
  // Client — minimal WebSocket client (connect/subscribe/publish/replay),
  // identical logic to mio-client.js, just referencing `Protocol` above
  // directly instead of through a separate UMD module.
  // ===========================================================================
  var WS_OPEN = 1;
  // WS close code sent by the server when AUTH is rejected (invalid or
  // expired token) — see WsController.rs::WS_CLOSE_CODE_AUTH_FAILED, the
  // one source of truth for this value.
  var WS_CLOSE_CODE_AUTH_FAILED = 4001;

  function MioEmbedClient(config) {
    this._config = {
      url: config.wsUrl,
      tenantId: config.tenantId,
      token: config.token,
      heartbeatIntervalMs: config.heartbeatIntervalMs || 15000,
      reconnect: config.reconnect !== false,
      reconnectBaseDelayMs: config.reconnectBaseDelayMs || 500,
      reconnectMaxDelayMs: config.reconnectMaxDelayMs || 15000,
    };
    this._ws = null;
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._closedByUser = true;
    this._subscriptions = {};
    // publish()/replay() called before the socket is open (e.g. right
    // after connect(), which opens it asynchronously) — queued here
    // instead of throwing, flushed once, in order, on the next open. See
    // subscribe() for the separate (and different: rejoined on *every*
    // reconnect) mechanism that already handled this correctly.
    this._pendingSends = []; // [opcode, channelId, payload][]
    this._listeners = { open: [], close: [], error: [], message: [], authFailed: [] };
  }

  MioEmbedClient.prototype.on = function (event, handler) {
    var list = this._listeners[event];
    if (!list) return function () {};
    list.push(handler);
    return function () {
      var i = list.indexOf(handler);
      if (i !== -1) list.splice(i, 1);
    };
  };

  MioEmbedClient.prototype._emit = function (event, payload) {
    var list = this._listeners[event];
    if (!list) return;
    list.slice().forEach(function (handler) {
      handler(payload);
    });
  };

  MioEmbedClient.prototype.connect = function () {
    this._closedByUser = false;
    this._openSocket();
  };

  MioEmbedClient.prototype.disconnect = function () {
    this._closedByUser = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._stopHeartbeat();
    if (this._ws) this._ws.close();
    this._ws = null;
  };

  MioEmbedClient.prototype.subscribe = function (channelId, handler) {
    var handlers = this._subscriptions[channelId];
    var isNew = !handlers;
    if (!handlers) {
      handlers = [];
      this._subscriptions[channelId] = handlers;
    }
    handlers.push(handler);

    if (isNew && this._ws && this._ws.readyState === WS_OPEN) {
      this._send(Protocol.Opcode.Subscribe, channelId, '');
    }

    var self = this;
    return function () {
      var list = self._subscriptions[channelId];
      if (!list) return;
      var i = list.indexOf(handler);
      if (i !== -1) list.splice(i, 1);
      if (list.length === 0) {
        delete self._subscriptions[channelId];
        if (self._ws && self._ws.readyState === WS_OPEN) {
          self._send(Protocol.Opcode.Unsub, channelId, '');
        }
      }
    };
  };

  /** No chunking. Throws if `payload` exceeds one frame (211 UTF-8 bytes). Deferred until the socket is open if called right after connect(), rather than throwing "not open". */
  MioEmbedClient.prototype.publish = function (channelId, payload) {
    if (encodeUtf8Length(payload) > Protocol.LEN_PAYLOAD) {
      throw new Error('mio-embed.js: publish() payload exceeds ' + Protocol.LEN_PAYLOAD + ' bytes (no chunking in this lightweight client)');
    }
    this._sendOrQueue(Protocol.Opcode.Publish, channelId, payload);
  };

  /** History since `sinceUnixSeconds` (0 = everything available) — arrives as normal messages on `channelId`'s handlers. Not supported on a wildcard pattern. Deferred until the socket is open if called right after connect(), rather than throwing. */
  MioEmbedClient.prototype.replay = function (channelId, sinceUnixSeconds) {
    this._sendOrQueue(Protocol.Opcode.Replay, channelId, String(sinceUnixSeconds || 0));
  };

  MioEmbedClient.prototype._sendOrQueue = function (opcode, channelId, payload) {
    if (this._ws && this._ws.readyState === WS_OPEN) {
      this._send(opcode, channelId, payload);
    } else {
      this._pendingSends.push([opcode, channelId, payload]);
    }
  };

  MioEmbedClient.prototype._openSocket = function () {
    var self = this;
    var ws = new WebSocket(this._config.url);
    ws.binaryType = 'arraybuffer';
    this._ws = ws;

    ws.onopen = function () {
      self._reconnectAttempt = 0;
      self._send(Protocol.Opcode.Auth, '', self._config.token);
      Object.keys(self._subscriptions).forEach(function (channelId) {
        self._send(Protocol.Opcode.Subscribe, channelId, '');
      });
      var pendingSends = self._pendingSends;
      self._pendingSends = [];
      pendingSends.forEach(function (args) {
        self._send(args[0], args[1], args[2]);
      });
      self._startHeartbeat();
      self._emit('open', undefined);
    };

    ws.onmessage = function (event) {
      var raw = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;
      if (!raw) {
        self._emit('error', new Error('received a frame in an unexpected format (not an ArrayBuffer)'));
        return;
      }
      var frame;
      try {
        frame = Protocol.decodeFrame(raw);
      } catch (err) {
        self._emit('error', err);
        return;
      }
      self._dispatch(frame);
    };

    ws.onerror = function () {
      self._emit('error', new Error('WebSocket connection error'));
    };

    ws.onclose = function (event) {
      self._stopHeartbeat();
      self._ws = null;
      self._emit('close', { code: event.code, reason: event.reason });

      // Retrying with the exact same token the server just rejected would
      // just fail again, forever, silently — emit a distinguishable event
      // instead and never auto-reconnect here, no matter `reconnect`.
      if (event.code === WS_CLOSE_CODE_AUTH_FAILED) {
        self._emit('authFailed', { code: event.code, reason: event.reason });
        return;
      }

      if (!self._closedByUser && self._config.reconnect) {
        self._scheduleReconnect();
      }
    };
  };

  MioEmbedClient.prototype._scheduleReconnect = function () {
    var self = this;
    var delay = Math.min(this._config.reconnectBaseDelayMs * Math.pow(2, this._reconnectAttempt), this._config.reconnectMaxDelayMs);
    var jitter = delay * (0.8 + Math.random() * 0.4);
    this._reconnectAttempt += 1;
    this._reconnectTimer = setTimeout(function () {
      if (!self._closedByUser) self._openSocket();
    }, jitter);
  };

  MioEmbedClient.prototype._startHeartbeat = function () {
    this._stopHeartbeat();
    var self = this;
    this._heartbeatTimer = setInterval(function () {
      if (self._ws && self._ws.readyState === WS_OPEN) {
        self._send(Protocol.Opcode.Ping, '', '');
      }
    }, this._config.heartbeatIntervalMs);
  };

  MioEmbedClient.prototype._stopHeartbeat = function () {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  };

  MioEmbedClient.prototype._dispatch = function (frame) {
    var message = { channelId: frame.channelId, payload: frame.payload, tenantId: frame.tenantId, receivedAt: Date.now() };
    this._emit('message', message);

    var exact = this._subscriptions[frame.channelId];
    if (exact) exact.slice().forEach(function (h) { h(message); });

    var subs = this._subscriptions;
    Object.keys(subs).forEach(function (key) {
      if (key.indexOf('*') !== -1 && Protocol.globMatch(key, frame.channelId)) {
        subs[key].slice().forEach(function (h) { h(message); });
      }
    });
  };

  MioEmbedClient.prototype._send = function (opcode, channelId, payload) {
    if (!this._ws || this._ws.readyState !== WS_OPEN) {
      throw new Error('mio-embed.js: cannot send, WebSocket is not open');
    }
    this._ws.send(Protocol.encodeFrame({ opcode: opcode, tenantId: this._config.tenantId, channelId: channelId, payload: payload }));
  };

  function encodeUtf8Length(s) {
    var bytes = 0;
    for (var i = 0; i < s.length; i++) {
      var code = s.codePointAt(i);
      if (code > 0xffff) i++;
      if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code <= 0xffff) bytes += 3;
      else bytes += 4;
    }
    return bytes;
  }

  // ===========================================================================
  // Background notifications — tab open, hidden/unfocused. Native browser
  // `Notification` API only, no server setup, no Service Worker, no VAPID
  // keys: the message already arrives over the WS connection this client
  // holds open, this just decides whether to also surface it as a system
  // notification. Mirrors @mio/realtime-sdk's `attachBackgroundNotifications`
  // (see notifications.ts) — same semantics, ported to this file's
  // zero-dependency, no-build-step constraints. For notifications that also
  // work with the tab or browser fully closed, that needs real Web Push
  // (a Service Worker + VAPID keys + `POST /api/v1/push/subscriptions`) —
  // out of scope for this lightweight client, use `@mio/realtime-sdk`'s
  // `registerPushServiceWorker`/`subscribeToPush` instead.
  // ===========================================================================

  MioEmbedClient.isNotificationSupported = function () {
    return typeof window !== 'undefined' && typeof Notification !== 'undefined';
  };

  /** Must be called from a user gesture (a click) in most browsers. */
  MioEmbedClient.requestNotificationPermission = function () {
    if (!MioEmbedClient.isNotificationSupported()) return Promise.resolve('denied');
    return Notification.requestPermission();
  };

  /**
   * Shows a native `Notification` for `message`, if the page is hidden or
   * unfocused (no-op otherwise — doesn't double what's already visible on
   * screen). Same logic `attachBackgroundNotifications` uses internally,
   * but callable directly from anywhere — a `subscribe()` callback,
   * for example — not just the client's own `'message'` event. Silently
   * does nothing if permission was never granted — call
   * `requestNotificationPermission()` first, typically on a click.
   *
   * @param {object} message
   * @param {object} [options]
   * @param {(message: object) => boolean} [options.filter] Only notify for messages that pass this — default: all.
   * @param {(message: object) => string} [options.title] Default: the channel ID.
   * @param {(message: object) => string} [options.body] Default: the raw payload.
   * @param {string} [options.icon]
   * @param {(message: object) => void} [options.onClick] Called on notification click (window is focused first).
   */
  MioEmbedClient.showBackgroundNotification = function (message, options) {
    if (!MioEmbedClient.isNotificationSupported()) return;
    options = options || {};

    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    if (options.filter && !options.filter(message)) return;

    var title = options.title ? options.title(message) : message.channelId;
    var body = options.body ? options.body(message) : message.payload;
    var notificationOptions = { body: body };
    if (options.icon !== undefined) notificationOptions.icon = options.icon;
    var notification = new Notification(title, notificationOptions);
    notification.onclick = function () {
      window.focus();
      if (options.onClick) options.onClick(message);
    };
  };

  /**
   * Shows a native `Notification` for every message `client` receives
   * (any channel — subscribes to the client's own `'message'` event,
   * fired before per-channel dispatch) while the page is hidden or
   * unfocused, without having to call `showBackgroundNotification`
   * yourself in every `subscribe()`. Silently does nothing if permission
   * was never granted — call `requestNotificationPermission()` first,
   * typically on a click.
   *
   * @param {MioEmbedClient} client
   * @param {object} [options] Same shape as `showBackgroundNotification`'s.
   * @returns {() => void} Unsubscribe.
   */
  MioEmbedClient.attachBackgroundNotifications = function (client, options) {
    if (!MioEmbedClient.isNotificationSupported()) return function () {};

    return client.on('message', function (message) {
      MioEmbedClient.showBackgroundNotification(message, options);
    });
  };

  // ===========================================================================
  // Auto-init — reads this <script> tag's own data-* attributes and, if a
  // token/channel were provided, renders a minimal live feed with zero
  // additional JS. Never runs outside a browser (no `document`), and never
  // runs if the required attributes are absent — importing this file (e.g.
  // for its exports below) without configuring it is inert.
  // ===========================================================================
  function autoInit() {
    if (typeof document === 'undefined' || !document.currentScript) return;
    var script = document.currentScript;
    var ds = script.dataset || {};
    if (!ds.wsUrl || !ds.tenantId || !ds.token || !ds.channel) return;

    var container = ds.target ? document.querySelector(ds.target) : null;
    if (!container) {
      container = document.createElement('div');
      script.parentNode.insertBefore(container, script.nextSibling);
    }
    container.innerHTML =
      '<p class="mio-embed-status" style="font:12px/1.4 monospace;color:#6272a4;margin:0 0 6px;">Connecting…</p>' +
      '<ul class="mio-embed-messages" style="list-style:none;margin:0;padding:0;font:13px/1.5 monospace;"></ul>';
    var statusEl = container.querySelector('.mio-embed-status');
    var listEl = container.querySelector('.mio-embed-messages');
    var limit = parseInt(ds.limit, 10) || 20;

    var client = new MioEmbedClient({
      wsUrl: ds.wsUrl,
      tenantId: ds.tenantId,
      token: ds.token,
    });

    client.on('open', function () {
      statusEl.textContent = 'Live';
    });
    client.on('close', function () {
      statusEl.textContent = 'Reconnecting…';
    });
    client.on('error', function (err) {
      statusEl.textContent = 'Connection error: ' + err.message;
    });
    client.subscribe(ds.channel, function (message) {
      var item = document.createElement('li');
      item.textContent = message.payload;
      item.style.cssText = 'padding:6px 0;border-bottom:1px solid #44475a22;';
      listEl.appendChild(item);
      while (listEl.children.length > limit) listEl.removeChild(listEl.firstChild);
    });

    client.connect();
    if (ds.replay === 'true') client.replay(ds.channel, 0);

    global.MioEmbed = global.MioEmbed || {};
    global.MioEmbed.client = client;
  }

  var exportsObject = { Protocol: Protocol, Client: MioEmbedClient };

  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObject;
  } else {
    global.MioEmbedClient = MioEmbedClient;
    global.MioEmbedProtocol = Protocol;
    autoInit();
  }
})(typeof self !== 'undefined' ? self : this);
