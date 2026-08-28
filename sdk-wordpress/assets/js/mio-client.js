/**
 * mio-client.js — minimal browser WebSocket client for the platform's
 * fixed-frame protocol (`mio-protocol.js`), scoped to what a WordPress
 * page actually needs: connect, subscribe, receive, publish. Not a full
 * port of `sdk-typescript/src/client.ts` — deliberately trimmed (no
 * UNICAST, no chunking, no REPLAY beyond the one `replay()` call below)
 * to stay a plain `<script>`-tag file with zero dependencies. Reach for
 * `@mio/realtime-sdk` (bundled via your own build step) instead if you
 * need the full feature set inside a WordPress page.
 *
 * Depends on `mio-protocol.js` (loaded first — see `Shortcode::enqueueAssets`).
 * UMD like it: `window.MioRealtimeClient` as a `<script>` tag, or
 * `require()`-able from Node for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./mio-protocol.js'));
  } else {
    root.MioRealtimeClient = factory(root.MioProtocol);
  }
})(typeof self !== 'undefined' ? self : this, function (MioProtocol) {
  'use strict';

  var Opcode = MioProtocol.Opcode;
  var WS_OPEN = 1;

  function resolveUrl(config) {
    if (config.url) return config.url;
    var scheme = config.secure ? 'wss' : 'ws';
    var port = config.port || 8080;
    var path = config.path || '/ws';
    if (path.charAt(0) !== '/') path = '/' + path;
    return scheme + '://' + config.host + ':' + port + path;
  }

  /**
   * @param {object} config
   * @param {string} [config.url]
   * @param {string} [config.host]
   * @param {number} [config.port]
   * @param {boolean} [config.secure]
   * @param {string} [config.path]
   * @param {string} config.tenantId
   * @param {string} config.token
   * @param {number} [config.heartbeatIntervalMs] default 15000
   * @param {boolean} [config.reconnect] default true
   * @param {number} [config.reconnectBaseDelayMs] default 500
   * @param {number} [config.reconnectMaxDelayMs] default 15000
   */
  function MioRealtimeClient(config) {
    this._config = {
      url: resolveUrl(config),
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
    this._subscriptions = {}; // channelId/pattern -> [handler, ...]
    this._listeners = { open: [], close: [], error: [], message: [] };
  }

  MioRealtimeClient.prototype.on = function (event, handler) {
    var list = this._listeners[event];
    if (!list) return function () {};
    list.push(handler);
    var self = this;
    return function () {
      var i = list.indexOf(handler);
      if (i !== -1) list.splice(i, 1);
      void self;
    };
  };

  MioRealtimeClient.prototype._emit = function (event, payload) {
    var list = this._listeners[event];
    if (!list) return;
    list.slice().forEach(function (handler) {
      handler(payload);
    });
  };

  MioRealtimeClient.prototype.connect = function () {
    this._closedByUser = false;
    this._openSocket();
  };

  MioRealtimeClient.prototype.disconnect = function () {
    this._closedByUser = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._stopHeartbeat();
    if (this._ws) this._ws.close();
    this._ws = null;
  };

  MioRealtimeClient.prototype.subscribe = function (channelId, handler) {
    var handlers = this._subscriptions[channelId];
    var isNew = !handlers;
    if (!handlers) {
      handlers = [];
      this._subscriptions[channelId] = handlers;
    }
    handlers.push(handler);

    if (isNew && this._ws && this._ws.readyState === WS_OPEN) {
      this._send(Opcode.Subscribe, channelId, '');
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
          self._send(Opcode.Unsub, channelId, '');
        }
      }
    };
  };

  /** No chunking — see this file's doc comment. Throws if `payload` exceeds one frame (211 UTF-8 bytes). */
  MioRealtimeClient.prototype.publish = function (channelId, payload) {
    if (encodeUtf8Length(payload) > MioProtocol.LEN_PAYLOAD) {
      throw new Error(
        'mio-client.js: publish() payload exceeds ' + MioProtocol.LEN_PAYLOAD + ' bytes (no chunking in this lightweight client)'
      );
    }
    this._send(Opcode.Publish, channelId, payload);
  };

  /** Requests history since `sinceUnixSeconds` (0 = everything available) — arrives as normal messages on `channelId`'s handlers. Not supported on a wildcard pattern (server ignores it silently). */
  MioRealtimeClient.prototype.replay = function (channelId, sinceUnixSeconds) {
    this._send(Opcode.Replay, channelId, String(sinceUnixSeconds || 0));
  };

  MioRealtimeClient.prototype._openSocket = function () {
    var self = this;
    var ws = new WebSocket(this._config.url);
    ws.binaryType = 'arraybuffer';
    this._ws = ws;

    ws.onopen = function () {
      self._reconnectAttempt = 0;
      self._send(Opcode.Auth, '', self._config.token);
      Object.keys(self._subscriptions).forEach(function (channelId) {
        self._send(Opcode.Subscribe, channelId, '');
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
        frame = MioProtocol.decodeFrame(raw);
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
      if (!self._closedByUser && self._config.reconnect) {
        self._scheduleReconnect();
      }
    };
  };

  MioRealtimeClient.prototype._scheduleReconnect = function () {
    var self = this;
    var delay = Math.min(
      this._config.reconnectBaseDelayMs * Math.pow(2, this._reconnectAttempt),
      this._config.reconnectMaxDelayMs
    );
    var jitter = delay * (0.8 + Math.random() * 0.4);
    this._reconnectAttempt += 1;
    this._reconnectTimer = setTimeout(function () {
      if (!self._closedByUser) self._openSocket();
    }, jitter);
  };

  MioRealtimeClient.prototype._startHeartbeat = function () {
    this._stopHeartbeat();
    var self = this;
    this._heartbeatTimer = setInterval(function () {
      if (self._ws && self._ws.readyState === WS_OPEN) {
        self._send(Opcode.Ping, '', '');
      }
    }, this._config.heartbeatIntervalMs);
  };

  MioRealtimeClient.prototype._stopHeartbeat = function () {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  };

  MioRealtimeClient.prototype._dispatch = function (frame) {
    var message = {
      channelId: frame.channelId,
      payload: frame.payload,
      tenantId: frame.tenantId,
      receivedAt: Date.now(),
    };
    this._emit('message', message);

    var exact = this._subscriptions[frame.channelId];
    if (exact) exact.slice().forEach(function (h) { h(message); });

    var subs = this._subscriptions;
    Object.keys(subs).forEach(function (key) {
      if (key.indexOf('*') !== -1 && MioProtocol.globMatch(key, frame.channelId)) {
        subs[key].slice().forEach(function (h) { h(message); });
      }
    });
  };

  MioRealtimeClient.prototype._send = function (opcode, channelId, payload) {
    if (!this._ws || this._ws.readyState !== WS_OPEN) {
      throw new Error('mio-client.js: cannot send, WebSocket is not open');
    }
    this._ws.send(MioProtocol.encodeFrame({ opcode: opcode, tenantId: this._config.tenantId, channelId: channelId, payload: payload }));
  };

  function encodeUtf8Length(s) {
    // Byte length without allocating a full TextEncoder buffer, since this
    // runs on every publish() call: counted per UTF-16 code unit/surrogate
    // pair, matching how much space `s` actually needs UTF-8-encoded.
    var bytes = 0;
    for (var i = 0; i < s.length; i++) {
      var code = s.codePointAt(i);
      if (code > 0xffff) i++; // surrogate pair consumed two UTF-16 units
      if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code <= 0xffff) bytes += 3;
      else bytes += 4;
    }
    return bytes;
  }

  // Exposed for `tests/js/client.test.js` only — not meant as public API,
  // hence the underscore; `encodeUtf8Length` has no reason to be called
  // from outside `publish()`'s own size guard.
  MioRealtimeClient._encodeUtf8Length = encodeUtf8Length;

  return MioRealtimeClient;
});
