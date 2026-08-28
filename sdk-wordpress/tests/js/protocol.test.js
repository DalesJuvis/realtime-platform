/**
 * protocol.test.js — same cases as `sdk-typescript/src/protocol.test.ts`,
 * run against this plugin's own UMD port (`assets/js/mio-protocol.js`) to
 * verify the port stayed bit-for-bit faithful. `node --test`, no
 * dependency, same choice `sdk-typescript` made and for the same reason.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const MioProtocol = require('../../assets/js/mio-protocol.js');

const { Opcode, ProtocolError, bytesToUuid, crc16CcittFalse, decodeFrame, encodeFrame, globMatch, uuidToBytes, FRAME_SIZE } =
  MioProtocol;

const SAMPLE_TENANT = '12345678-9abc-def0-1122-334455667788';

test('encode then decode round-trips every field', () => {
  const raw = encodeFrame({
    opcode: Opcode.Publish,
    tenantId: SAMPLE_TENANT,
    channelId: 'room-42',
    payload: 'hello world',
  });
  assert.equal(raw.length, FRAME_SIZE);

  const frame = decodeFrame(raw);
  assert.equal(frame.opcode, Opcode.Publish);
  assert.equal(frame.tenantId, SAMPLE_TENANT);
  assert.equal(frame.channelId, 'room-42');
  assert.equal(frame.payload, 'hello world');
});

test('uuidToBytes then bytesToUuid is an identity round-trip', () => {
  const bytes = uuidToBytes(SAMPLE_TENANT);
  assert.equal(bytes.length, 16);
  assert.equal(bytesToUuid(bytes), SAMPLE_TENANT);
});

test('rejects an invalid frame length', () => {
  assert.throws(() => decodeFrame(new Uint8Array(100)), ProtocolError);
});

test('rejects an invalid magic', () => {
  const raw = encodeFrame({ opcode: Opcode.Ping, tenantId: SAMPLE_TENANT });
  raw[0] = 0x00;
  assert.throws(() => decodeFrame(raw), ProtocolError);
});

test('rejects a corrupted CRC', () => {
  const raw = encodeFrame({ opcode: Opcode.Message, tenantId: SAMPLE_TENANT, payload: 'data' });
  raw[50] ^= 0xff;
  assert.throws(() => decodeFrame(raw), ProtocolError);
});

test('truncates an oversized channelId on a valid UTF-8 boundary', () => {
  const raw = encodeFrame({
    opcode: Opcode.Subscribe,
    tenantId: SAMPLE_TENANT,
    channelId: 'x'.repeat(100),
  });
  const frame = decodeFrame(raw);
  assert.equal(frame.channelId.length, 24);
});

test('truncates a multi-byte UTF-8 payload without splitting a character', () => {
  // Each '€' is 3 UTF-8 bytes; 211 isn't a multiple of 3, so a naive
  // byte-boundary cut would slice one in half without the boundary fix
  // in mio-protocol.js's writePadded.
  const raw = encodeFrame({ opcode: Opcode.Publish, tenantId: SAMPLE_TENANT, payload: '€'.repeat(100) });
  const frame = decodeFrame(raw);
  assert.ok(frame.payload.length > 0);
  // Every character that did make it through must be a real '€', never a
  // partial/garbled one — proves no multi-byte sequence got split.
  assert.ok(/^€+$/.test(frame.payload));
});

test('crc16CcittFalse is deterministic and sensitive to any change', () => {
  const a = new TextEncoder().encode('hello');
  const b = new TextEncoder().encode('hellp');
  assert.notEqual(crc16CcittFalse(a), crc16CcittFalse(b));
  assert.equal(crc16CcittFalse(a), crc16CcittFalse(a));
});

test('unsub opcode round-trip', () => {
  const raw = encodeFrame({ opcode: Opcode.Unsub, tenantId: SAMPLE_TENANT, channelId: 'room-42' });
  const frame = decodeFrame(raw);
  assert.equal(frame.opcode, Opcode.Unsub);
  assert.equal(frame.channelId, 'room-42');
});

test('globMatch — simple trailing wildcard', () => {
  assert.ok(globMatch('orders:*', 'orders:42'));
  assert.ok(!globMatch('orders:*', 'invoices:42'));
});

test('globMatch — wildcard in the middle of the pattern', () => {
  assert.ok(globMatch('app_123:*:eu', 'app_123:orders:eu'));
  assert.ok(!globMatch('app_123:*:eu', 'app_123:orders:us'));
});
