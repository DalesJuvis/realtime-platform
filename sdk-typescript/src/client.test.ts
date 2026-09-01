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
import { Opcode, decodeFrame, encodeFrame } from "./protocol.js";
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

function makeSlowOpeningClient(): { client: RealtimeClient; nextWs: () => Promise<SlowOpeningFakeWebSocket> } {
  let latestWs: SlowOpeningFakeWebSocket | undefined;
  const WsImpl = class extends SlowOpeningFakeWebSocket {
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

  async function nextWs(): Promise<SlowOpeningFakeWebSocket> {
    await new Promise((r) => setTimeout(r, 0));
    if (!latestWs) throw new Error("no WebSocket instance created yet");
    return latestWs;
  }

  return { client, nextWs };
}

test("replay() called synchronously right after connect() doesn't throw, and is sent once the socket actually opens", async () => {
  const { client, nextWs } = makeSlowOpeningClient();

  client.connect();
  // Same call pattern mio-embed.js's autoInit uses — must not throw even
  // though the fake socket is still CONNECTING at this exact point.
  assert.doesNotThrow(() => client.replay("orders:42", 0));

  const ws = await nextWs();
  const opcodes = ws.sent.map((frame) => frame[2]);
  assert.deepEqual(opcodes, [Opcode.Auth, Opcode.Replay]);

  client.disconnect();
});

test("publish() called synchronously right after connect() doesn't throw, and is sent once the socket actually opens", async () => {
  const { client, nextWs } = makeSlowOpeningClient();

  client.connect();
  // The exact pattern every quick-start snippet in this project's own
  // docs shows (DOCS.md, LLMS.md, sdk-typescript/README.md) — must not
  // throw even though the fake socket is still CONNECTING here.
  assert.doesNotThrow(() => client.publish("orders:42", "order created"));

  const ws = await nextWs();
  const opcodes = ws.sent.map((frame) => frame[2]);
  assert.deepEqual(opcodes, [Opcode.Auth, Opcode.Publish]);

  client.disconnect();
});

test("unicast() called synchronously right after connect() doesn't throw, and is sent once the socket actually opens", async () => {
  const { client, nextWs } = makeSlowOpeningClient();

  client.connect();
  assert.doesNotThrow(() => client.unicast("user-42", "you have a new order"));

  const ws = await nextWs();
  const opcodes = ws.sent.map((frame) => frame[2]);
  assert.deepEqual(opcodes, [Opcode.Auth, Opcode.Unicast]);

  client.disconnect();
});

test("publish() then replay() called before open are flushed in call order", async () => {
  const { client, nextWs } = makeSlowOpeningClient();

  client.connect();
  client.publish("orders:42", "order created");
  client.replay("orders:42", 0);

  const ws = await nextWs();
  const opcodes = ws.sent.map((frame) => frame[2]);
  assert.deepEqual(opcodes, [Opcode.Auth, Opcode.Publish, Opcode.Replay]);

  client.disconnect();
});

/** Like `makeClient()`, but with reconnection actually enabled (a short,
 * fixed delay) and a construction counter — everything the two tests
 * below need to tell "reconnected" from "didn't". */
function makeReconnectingClient(): {
  client: RealtimeClient;
  nextWs: () => Promise<FakeWebSocket>;
  constructCount: () => number;
} {
  let latestWs: FakeWebSocket | undefined;
  let count = 0;
  const WsImpl = class extends FakeWebSocket {
    constructor(url: string) {
      super(url);
      count++;
      latestWs = this;
    }
  };

  const client = new RealtimeClient({
    wsUrl: "ws://example.test/ws",
    tenantId: TENANT_ID,
    token: "fake-token",
    reconnect: true,
    reconnectBaseDelayMs: 5,
    reconnectMaxDelayMs: 5,
    webSocketImpl: WsImpl,
  });

  async function nextWs(): Promise<FakeWebSocket> {
    await new Promise((r) => setTimeout(r, 0));
    if (!latestWs) throw new Error("no WebSocket instance created yet");
    return latestWs;
  }

  return { client, nextWs, constructCount: () => count };
}

test("authFailed fires and no reconnect is attempted on the server's auth-failure close code", async () => {
  const { client, nextWs, constructCount } = makeReconnectingClient();
  const authFailedEvents: unknown[] = [];
  client.on("authFailed", (e) => authFailedEvents.push(e));

  client.connect();
  const ws = await nextWs();
  assert.equal(constructCount(), 1);

  // The exact code/reason WsController.rs sends when AUTH is rejected.
  ws.onclose?.({ code: 4001, reason: "authentication failed" });

  // Long enough for a real reconnect attempt to have fired if one had
  // been scheduled (reconnectBaseDelayMs is 5 above).
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(authFailedEvents, [{ code: 4001, reason: "authentication failed" }]);
  assert.equal(constructCount(), 1, "must not reconnect after an auth-failure close — same token would just fail again");

  client.disconnect();
});

test("a normal close still reconnects — auth-failure handling doesn't break the general case", async () => {
  const { client, nextWs, constructCount } = makeReconnectingClient();

  client.connect();
  const ws = await nextWs();
  assert.equal(constructCount(), 1);

  ws.onclose?.({ code: 1006, reason: "" }); // abnormal closure, e.g. a network drop

  await new Promise((r) => setTimeout(r, 50));

  assert.equal(constructCount(), 2, "a non-auth-failure close must still trigger the normal reconnect");

  client.disconnect();
});

// getToken — silent renewal via an app-supplied callback (calls the
// caller's own backend, never mio's; this SDK never mints a token itself).

function makeGetTokenClient(getToken: () => Promise<{ token: string; wsUrl?: string }>): {
  client: RealtimeClient;
  nextWs: () => Promise<FakeWebSocket>;
  constructCount: () => number;
} {
  let latestWs: FakeWebSocket | undefined;
  let count = 0;
  const WsImpl = class extends FakeWebSocket {
    constructor(url: string) {
      super(url);
      count++;
      latestWs = this;
    }
  };

  const client = new RealtimeClient({
    wsUrl: "ws://example.test/ws",
    tenantId: TENANT_ID,
    getToken,
    reconnect: true,
    reconnectBaseDelayMs: 5,
    reconnectMaxDelayMs: 5,
    webSocketImpl: WsImpl,
  });

  async function nextWs(): Promise<FakeWebSocket> {
    await new Promise((r) => setTimeout(r, 0));
    if (!latestWs) throw new Error("no WebSocket instance created yet");
    return latestWs;
  }

  return { client, nextWs, constructCount: () => count };
}

function authTokenSentOn(ws: FakeWebSocket): string {
  const authFrame = ws.sent.find((f) => f[2] === Opcode.Auth);
  if (!authFrame) throw new Error("no AUTH frame was sent");
  return decodeFrame(authFrame).payload;
}

test("getToken is called before the first connect and its token is used for AUTH", async () => {
  const { client, nextWs } = makeGetTokenClient(async () => ({ token: "token-from-my-backend" }));

  client.connect();
  const ws = await nextWs();

  assert.equal(authTokenSentOn(ws), "token-from-my-backend");
  client.disconnect();
});

test("getToken's wsUrl, when returned, overrides the configured one for that connection", async () => {
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
    getToken: async () => ({ token: "t", wsUrl: "wss://fresh.example.test/ws" }),
    reconnect: false,
    webSocketImpl: WsImpl,
  });

  client.connect();
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(latestWs?.url, "wss://fresh.example.test/ws");
  client.disconnect();
});

test("authFailed with getToken configured re-fetches a fresh token and reconnects with it — silent to the app", async () => {
  let call = 0;
  const { client, nextWs } = makeGetTokenClient(async () => {
    call++;
    return { token: `token-v${call}` };
  });

  client.connect();
  const firstWs = await nextWs();
  assert.equal(authTokenSentOn(firstWs), "token-v1");

  const authFailedEvents: unknown[] = [];
  client.on("authFailed", (e) => authFailedEvents.push(e));
  firstWs.onclose?.({ code: 4001, reason: "authentication failed" });

  // Long enough for the backoff-scheduled reconnect (5ms) to fire —
  // nextWs()'s own single-tick wait alone isn't, this is timer-scheduled,
  // not microtask-driven like the initial connect.
  await new Promise((r) => setTimeout(r, 50));
  const secondWs = await nextWs();
  assert.notEqual(secondWs, firstWs, "must have opened a new socket, not reused the rejected one");
  assert.equal(authTokenSentOn(secondWs), "token-v2", "must reconnect with a freshly-fetched token, not the stale one");
  assert.deepEqual(authFailedEvents, [{ code: 4001, reason: "authentication failed" }]);

  client.disconnect();
});

test("a getToken rejection emits error and still reconnects with backoff — no tight retry loop", async () => {
  let call = 0;
  const { client, nextWs, constructCount } = makeGetTokenClient(async () => {
    call++;
    if (call === 1) throw new Error("my backend is down");
    return { token: "token-after-recovery" };
  });

  const errors: unknown[] = [];
  client.on("error", (e) => errors.push(e));

  client.connect();
  // No socket should ever be constructed for the failed first attempt.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(constructCount(), 0);

  // The retry (reconnectBaseDelayMs: 5) picks it up on the second call —
  // wait long enough for that timer-scheduled attempt to actually fire.
  await new Promise((r) => setTimeout(r, 50));
  const ws = await nextWs();
  assert.equal(authTokenSentOn(ws), "token-after-recovery");
  assert.equal(errors.length, 1);
  assert.match((errors[0] as Error).message, /my backend is down/);

  client.disconnect();
});

test("publishTemplate posts to the derived HTTP URL with the client's token and tenant", async () => {
  const client = new RealtimeClient({
    wsUrl: "wss://example.test/ws",
    tenantId: TENANT_ID,
    token: "my-token",
  });

  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ success: true, data: { published: true } }));
  }) as typeof fetch;

  try {
    await client.publishTemplate("orders:42", "template-id-1", { name: "Ada" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedUrl, "https://example.test/api/v1/messages/template");
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer my-token");
  assert.deepEqual(JSON.parse(capturedInit?.body as string), {
    tenant_id: TENANT_ID,
    channel_id: "orders:42",
    template_id: "template-id-1",
    variables: { name: "Ada" },
  });
});

test("publishTemplate rejects with the server's error message on a non-success envelope", async () => {
  const client = new RealtimeClient({
    wsUrl: "wss://example.test/ws",
    tenantId: TENANT_ID,
    token: "my-token",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "template not found" } }),
    )) as typeof fetch;

  try {
    await assert.rejects(
      () => client.publishTemplate("orders:42", "missing-template"),
      /template not found/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publishTemplate re-fetches a fresh token via getToken rather than using a stale one", async () => {
  const client = new RealtimeClient({
    wsUrl: "wss://example.test/ws",
    tenantId: TENANT_ID,
    getToken: async () => ({ token: "fresh-token" }),
  });

  let capturedAuth: string | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    capturedAuth = (init.headers as Record<string, string>).Authorization;
    return new Response(JSON.stringify({ success: true, data: { published: true } }));
  }) as typeof fetch;

  try {
    await client.publishTemplate("orders:42", "template-id-1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedAuth, "Bearer fresh-token");
});
