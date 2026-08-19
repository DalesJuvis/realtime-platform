/**
 * `protocol.test.ts` — Tests du codec binaire, via le test runner intégré
 * de Node.js (`node --test`) pour ne pas imposer de dépendance de test
 * supplémentaire (Jest/Vitest) à un SDK destiné à être installé par des
 * tiers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Opcode,
  ProtocolError,
  bytesToUuid,
  crc16CcittFalse,
  decodeFrame,
  encodeFrame,
  globMatch,
  uuidToBytes,
  FRAME_SIZE,
} from "./protocol.js";

const SAMPLE_TENANT = "12345678-9abc-def0-1122-334455667788";

test("encode puis decode restitue les mêmes champs", () => {
  const raw = encodeFrame({
    opcode: Opcode.Publish,
    tenantId: SAMPLE_TENANT,
    channelId: "room-42",
    payload: "hello world",
  });
  assert.equal(raw.length, FRAME_SIZE);

  const frame = decodeFrame(raw);
  assert.equal(frame.opcode, Opcode.Publish);
  assert.equal(frame.tenantId, SAMPLE_TENANT);
  assert.equal(frame.channelId, "room-42");
  assert.equal(frame.payload, "hello world");
});

test("uuidToBytes puis bytesToUuid fait un aller-retour identité", () => {
  const bytes = uuidToBytes(SAMPLE_TENANT);
  assert.equal(bytes.length, 16);
  assert.equal(bytesToUuid(bytes), SAMPLE_TENANT);
});

test("rejette une longueur de frame invalide", () => {
  assert.throws(() => decodeFrame(new Uint8Array(100)), ProtocolError);
});

test("rejette un magic invalide", () => {
  const raw = encodeFrame({ opcode: Opcode.Ping, tenantId: SAMPLE_TENANT });
  raw[0] = 0x00; // corrompt le magic
  assert.throws(() => decodeFrame(raw), ProtocolError);
});

test("rejette un CRC corrompu", () => {
  const raw = encodeFrame({ opcode: Opcode.Message, tenantId: SAMPLE_TENANT, payload: "data" });
  raw[50] = (raw[50] ?? 0) ^ 0xff; // altère un octet du payload sans mettre à jour le CRC
  assert.throws(() => decodeFrame(raw), ProtocolError);
});

test("tronque un channelId trop long sur une frontière UTF-8 valide", () => {
  const raw = encodeFrame({
    opcode: Opcode.Subscribe,
    tenantId: SAMPLE_TENANT,
    channelId: "x".repeat(100), // dépasse le champ de 24 octets
  });
  const frame = decodeFrame(raw);
  assert.equal(frame.channelId.length, 24);
});

test("crc16CcittFalse est déterministe et sensible à toute altération", () => {
  const a = new TextEncoder().encode("hello");
  const b = new TextEncoder().encode("hellp");
  assert.notEqual(crc16CcittFalse(a), crc16CcittFalse(b));
  assert.equal(crc16CcittFalse(a), crc16CcittFalse(a));
});

test("unsub opcode roundtrip", () => {
  const raw = encodeFrame({ opcode: Opcode.Unsub, tenantId: SAMPLE_TENANT, channelId: "room-42" });
  const frame = decodeFrame(raw);
  assert.equal(frame.opcode, Opcode.Unsub);
  assert.equal(frame.channelId, "room-42");
});

test("globMatch — motif simple avec wildcard final", () => {
  assert.ok(globMatch("orders:*", "orders:42"));
  assert.ok(!globMatch("orders:*", "invoices:42"));
});

test("globMatch — wildcard au milieu du motif", () => {
  assert.ok(globMatch("app_123:*:eu", "app_123:orders:eu"));
  assert.ok(!globMatch("app_123:*:eu", "app_123:orders:us"));
});
