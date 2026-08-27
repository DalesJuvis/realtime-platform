/**
 * `chunking.test.ts` — Tests du découpage/réassemblage de messages plus
 * grands qu'un seul frame. Même test runner que `protocol.test.ts`
 * (`node --test`), pas de dépendance de test supplémentaire.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { LEN_PAYLOAD, ProtocolError } from "./protocol.js";
import { ChunkReassembler, DEFAULT_MAX_MESSAGE_BYTES, encodeChunks, parseChunk } from "./chunking.js";

test("un payload qui tient dans un seul frame n'est pas modifié", () => {
  const chunks = encodeChunks("hello world");
  assert.deepEqual(chunks, ["hello world"]);
});

test("un payload à la limite exacte des 211 octets n'est pas chunké", () => {
  const payload = "a".repeat(LEN_PAYLOAD);
  const chunks = encodeChunks(payload);
  assert.deepEqual(chunks, [payload]);
});

test("un payload trop grand est découpé, chaque morceau tenant dans un frame", () => {
  const payload = "x".repeat(1000);
  const chunks = encodeChunks(payload);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(new TextEncoder().encode(chunk).length <= LEN_PAYLOAD);
  }
});

test("découpage puis réassemblage restitue le texte original, ASCII", () => {
  const original = "x".repeat(1000);
  const chunks = encodeChunks(original);
  const reassembler = new ChunkReassembler();

  let result: string | null = null;
  for (const chunk of chunks) {
    const header = parseChunk(chunk);
    assert.ok(header, "chaque morceau doit être reconnu comme un chunk");
    result = reassembler.feed(header);
  }
  assert.equal(result, original);
});

test("découpage puis réassemblage restitue le texte original, UTF-8 multi-octets", () => {
  const original = "café 🎉 ".repeat(100); // mélange de caractères 1-4 octets
  const chunks = encodeChunks(original);
  assert.ok(chunks.length > 1);

  const reassembler = new ChunkReassembler();
  let result: string | null = null;
  for (const chunk of chunks) {
    const header = parseChunk(chunk);
    assert.ok(header);
    result = reassembler.feed(header);
  }
  assert.equal(result, original);
});

test("les chunks reçus dans le désordre sont réassemblés correctement", () => {
  const original = "0123456789".repeat(50);
  const chunks = encodeChunks(original);
  assert.ok(chunks.length > 1);

  const reversed = [...chunks].reverse();
  const reassembler = new ChunkReassembler();
  let result: string | null = null;
  for (const chunk of reversed) {
    const header = parseChunk(chunk);
    assert.ok(header);
    result = reassembler.feed(header);
  }
  assert.equal(result, original);
});

test("deux messages chunkés concurrents ne se mélangent pas", () => {
  const messageA = "A".repeat(1000);
  const messageB = "B".repeat(1000);
  const chunksA = encodeChunks(messageA);
  const chunksB = encodeChunks(messageB);

  const reassembler = new ChunkReassembler();
  let resultA: string | null = null;
  let resultB: string | null = null;

  // Entrelace l'envoi des deux messages, comme deux publications concurrentes.
  const max = Math.max(chunksA.length, chunksB.length);
  for (let i = 0; i < max; i++) {
    const a = chunksA[i];
    const b = chunksB[i];
    if (a) {
      const r = reassembler.feed(parseChunk(a)!);
      if (r !== null) resultA = r;
    }
    if (b) {
      const r = reassembler.feed(parseChunk(b)!);
      if (r !== null) resultB = r;
    }
  }

  assert.equal(resultA, messageA);
  assert.equal(resultB, messageB);
});

test("parseChunk retourne null pour un message ordinaire", () => {
  assert.equal(parseChunk("hello world"), null);
  assert.equal(parseChunk(""), null);
  assert.equal(parseChunk("just some : colons : in it"), null);
});

test("encodeChunks refuse un message au-delà de maxMessageBytes", () => {
  const payload = "x".repeat(DEFAULT_MAX_MESSAGE_BYTES + 1);
  assert.throws(() => encodeChunks(payload), ProtocolError);
});

test("maxMessageBytes est configurable", () => {
  const payload = "x".repeat(500);
  assert.throws(() => encodeChunks(payload, 300), ProtocolError);
  assert.doesNotThrow(() => encodeChunks(payload, 10_000));
});
