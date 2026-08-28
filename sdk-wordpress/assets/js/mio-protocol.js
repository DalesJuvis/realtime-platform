/**
 * mio-protocol.js — encoder/decoder for the platform's fixed 256-byte
 * binary frame, ported from `sdk-typescript/src/protocol.ts`. Must stay
 * bit-for-bit identical to it (and to `backend/src/protocol.rs`): same
 * offsets, same CRC16, same big-endian byte order.
 *
 * Plain UMD, no build step: works as a `<script>` tag (attaches
 * `window.MioProtocol`, loaded via `wp_enqueue_script` — see
 * `includes/Shortcode.php`) and as a `require()`-able CommonJS module
 * (`tests/js/protocol.test.js`, run via `node --test`).
 *
 * Layout (256 bytes):
 *   0..2      2   Magic + version (0xAA01)
 *   2..3      1   Opcode
 *   3..19     16  Tenant ID (raw UUID bytes)
 *   19..43    24  Channel ID (UTF-8, zero-padded)
 *   43..254   211 Payload (UTF-8, zero-padded)
 *   254..256  2   CRC16/CCITT-FALSE over bytes [0..254)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MioProtocol = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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
    throw new Error('mio-protocol.js: frame layout inconsistent with FRAME_SIZE');
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
    // `encodeInto` (used by the TS SDK) truncates on a whole-code-point
    // boundary for free; a plain `encode()` + slice can split a
    // multi-byte UTF-8 character in half at the truncation point. Fixed
    // up below by trimming back to the last complete code point instead
    // of just cutting at `dst.length`.
    var len = Math.min(encoded.length, dst.length);
    while (len > 0 && (encoded[len] & 0xc0) === 0x80) {
      // `len` landed mid-sequence (a continuation byte, 10xxxxxx) — back
      // up until it lands on a lead byte or ASCII byte instead.
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
    MAGIC: MAGIC,
    LEN_PAYLOAD: LEN_PAYLOAD,
    LEN_CHANNEL: LEN_CHANNEL,
    Opcode: Opcode,
    ProtocolError: ProtocolError,
    uuidToBytes: uuidToBytes,
    bytesToUuid: bytesToUuid,
    crc16CcittFalse: crc16CcittFalse,
    encodeFrame: encodeFrame,
    decodeFrame: decodeFrame,
    globMatch: globMatch,
  };
});
