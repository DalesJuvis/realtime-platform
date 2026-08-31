/**
 * `client.test.ts` — Tests de `RealtimeClient` contre un `WebSocketLike`
 * factice (`webSocketImpl`, prévu pour exactement ce cas d'usage — voir
 * sa doc dans `client.ts`), pas un vrai réseau. Se concentre sur
 * `client.channel()` : les tests unitaires de `ChannelHandle` lui-même
 * (contre un transport factice minimal) sont dans `channel.test.ts` —
 * celui-ci vérifie que le câblage réel (encode/decode de frame binaire,
 * dispatch `subscribe()`) fonctionne de bout en bout, pas juste l'objet isolé.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { RealtimeClient } from "./client.js";
import { Opcode, encodeFrame } from "./protocol.js";
import type { WebSocketLike } from "./client.js";

const TENANT_ID = "12345678-9abc-def0-1122-334455667788";
const WS_OPEN = 1;

/** Minimal `WebSocketLike` — s'ouvre immédiatement (microtask), collecte
 * tout ce qui est envoyé, et expose `emitIncoming()` pour simuler un
 * frame reçu du serveur dans un test. */
class FakeWebSocket implements WebSocketLike {
  binaryType = "";
  readyState = WS_OPEN;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  readonly sent: Uint8Array[] = [];

  constructor(public readonly url: string) {
    queueMicrotask(() => this.onopen?.(undefined));
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  emitIncoming(frame: Uint8Array): void {
    this.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
  }
}

function makeClient(): { client: RealtimeClient; nextWs: () => Promise<FakeWebSocket> } {
  let latestWs: FakeWebSocket | undefined;
  const WsImpl = class extends FakeWebSocket {
    constructor(url: string) {
      super(url);
      latestWs = this;
    }
  };

  const client = new RealtimeClient({
    wsUrl: "ws://example.test/ws",
    tenantId: TENANT_ID,
    token: "fake-token",
    reconnect: false,
    webSocketImpl: WsImpl,
  });

  async function nextWs(): Promise<FakeWebSocket> {
    // Laisse le microtask de connect()/openSocket() s'exécuter.
    await new Promise((r) => setTimeout(r, 0));
    if (!latestWs) throw new Error("no WebSocket instance created yet");
    return latestWs;
  }

  return { client, nextWs };
}

test("client.channel().on() reçoit un évènement livré via un vrai frame binaire décodé", async () => {
  const { client, nextWs } = makeClient();
  client.connect();
  const ws = await nextWs();

  const received: unknown[] = [];
  client.channel("orders:42").on<{ orderId: number }>("order.created", (data) => received.push(data));

  const incomingFrame = encodeFrame({
    opcode: Opcode.Message,
    tenantId: TENANT_ID,
    channelId: "orders:42",
    payload: JSON.stringify({ event: "order.created", data: { orderId: 7 } }),
  });
  ws.emitIncoming(incomingFrame);

  assert.deepEqual(received, [{ orderId: 7 }]);
  client.disconnect();
});

test("client.channel().emit() actually sends a real SUB then PUB frame over the wire", async () => {
  const { client, nextWs } = makeClient();
  client.connect();
  const ws = await nextWs();

  client.channel("orders:42").on("order.created", () => {});
  client.channel("orders:42").emit("order.created", { orderId: 1 });

  // AUTH, SUB, PUB — in that order, `on()` before `emit()`.
  const opcodes = ws.sent.map((frame) => frame[2]);
  assert.deepEqual(opcodes, [Opcode.Auth, Opcode.Subscribe, Opcode.Publish]);

  client.disconnect();
});

/** Unlike `FakeWebSocket` above (which starts `readyState = WS_OPEN` for
 * every other test's convenience), a real `WebSocket` starts CONNECTING
 * (0) and only becomes OPEN once `onopen` actually fires — this is what
 * reproduces the race a caller hits doing `client.connect(); client.replay(...)`
 * back to back, the exact pattern `mio-embed.js`'s autoInit uses. */
class SlowOpeningFakeWebSocket implements WebSocketLike {
  binaryType = "";
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  readonly sent: Uint8Array[] = [];

  constructor(public readonly url: string) {
    queueMicrotask(() => {
      this.readyState = WS_OPEN;
      this.onopen?.(undefined);
    });
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }
}

test("replay() called synchronously right after connect() doesn't throw, and is sent once the socket actually opens", async () => {
  let ws: SlowOpeningFakeWebSocket | undefined;
  const WsImpl = class extends SlowOpeningFakeWebSocket {
    constructor(url: string) {
      super(url);
      ws = this;
    }
  };

  const client = new RealtimeClient({
    wsUrl: "ws://example.test/ws",
    tenantId: TENANT_ID,
    token: "fake-token",
    reconnect: false,
    webSocketImpl: WsImpl,
  });

  client.connect();
  // Same call pattern mio-embed.js's autoInit uses — must not throw even
  // though the fake socket is still CONNECTING at this exact point.
  assert.doesNotThrow(() => client.replay("orders:42", 0));

  await new Promise((r) => setTimeout(r, 0));
  if (!ws) throw new Error("no WebSocket instance created yet");

  const opcodes = ws.sent.map((frame) => frame[2]);
  assert.deepEqual(opcodes, [Opcode.Auth, Opcode.Replay]);

  client.disconnect();
});
