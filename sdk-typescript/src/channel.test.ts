/**
 * `channel.test.ts` — Tests de `ChannelHandle` contre un `ChannelTransport`
 * factice en mémoire (pas de WebSocket réel nécessaire : `ChannelHandle`
 * ne dépend que de `subscribe`/`publish`, voir `channel.ts`). Même test
 * runner que `protocol.test.ts`/`chunking.test.ts` (`node --test`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ChannelHandle, type ChannelTransport } from "./channel.js";
import type { MessageHandler, RealtimeMessage, Unsubscribe } from "./types.js";

/** Petit broker en mémoire — publish() sur un canal appelle synchronement
 * tout handler subscribe() sur ce même canal, exactement comme le ferait
 * `RealtimeClient` (sans le réseau). */
class FakeTransport implements ChannelTransport {
  private readonly handlers = new Map<string, Set<MessageHandler>>();

  subscribe(channelId: string, handler: MessageHandler): Unsubscribe {
    let set = this.handlers.get(channelId);
    if (!set) {
      set = new Set();
      this.handlers.set(channelId, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  publish(channelId: string, payload: string): void {
    const message: RealtimeMessage = { channelId, payload, receivedAt: Date.now() };
    this.handlers.get(channelId)?.forEach((h) => h(message));
  }

  subscriberCount(channelId: string): number {
    return this.handlers.get(channelId)?.size ?? 0;
  }
}

test("on() reçoit les données d'un évènement émis avec emit() sur le même canal", () => {
  const transport = new FakeTransport();
  const channel = new ChannelHandle(transport, "orders:42");

  const received: unknown[] = [];
  channel.on<{ orderId: number }>("order.created", (data) => received.push(data));

  channel.emit("order.created", { orderId: 123 });

  assert.deepEqual(received, [{ orderId: 123 }]);
});

test("on() ignore un évènement de nom différent sur le même canal", () => {
  const transport = new FakeTransport();
  const channel = new ChannelHandle(transport, "orders:42");

  const received: unknown[] = [];
  channel.on("order.created", (data) => received.push(data));

  channel.emit("order.cancelled", { orderId: 123 });

  assert.deepEqual(received, []);
});

test("plusieurs on() sur des évènements différents du même canal ne se gênent pas, et partagent un seul abonnement réseau", () => {
  const transport = new FakeTransport();
  const channel = new ChannelHandle(transport, "orders:42");

  const created: unknown[] = [];
  const cancelled: unknown[] = [];
  channel.on("order.created", (data) => created.push(data));
  channel.on("order.cancelled", (data) => cancelled.push(data));

  assert.equal(transport.subscriberCount("orders:42"), 2); // deux handlers, un seul canal

  channel.emit("order.created", { orderId: 1 });
  channel.emit("order.cancelled", { orderId: 2 });

  assert.deepEqual(created, [{ orderId: 1 }]);
  assert.deepEqual(cancelled, [{ orderId: 2 }]);
});

test("on() ignore silencieusement un publish() brut (pas l'enveloppe JSON {event, data})", () => {
  const transport = new FakeTransport();
  const channel = new ChannelHandle(transport, "orders:42");

  const received: unknown[] = [];
  channel.on("order.created", (data) => received.push(data));

  assert.doesNotThrow(() => transport.publish("orders:42", "just a plain string message"));
  assert.doesNotThrow(() => transport.publish("orders:42", JSON.stringify({ foo: "bar" }))); // JSON valide mais pas la forme {event, data}
  assert.doesNotThrow(() => transport.publish("orders:42", "{not even valid json"));

  assert.deepEqual(received, []);
});

test("emit() sans data n'inclut pas la clé data dans le JSON publié", () => {
  const transport = new FakeTransport();
  const channel = new ChannelHandle(transport, "orders:42");

  let rawPayload = "";
  transport.subscribe("orders:42", (message) => {
    rawPayload = message.payload;
  });

  channel.emit("ping");

  assert.deepEqual(JSON.parse(rawPayload), { event: "ping" });
  assert.equal("data" in JSON.parse(rawPayload), false);
});

test("deux canaux différents sont indépendants", () => {
  const transport = new FakeTransport();
  const orders = new ChannelHandle(transport, "orders:42");
  const invoices = new ChannelHandle(transport, "invoices:1");

  const ordersReceived: unknown[] = [];
  const invoicesReceived: unknown[] = [];
  orders.on("created", (data) => ordersReceived.push(data));
  invoices.on("created", (data) => invoicesReceived.push(data));

  orders.emit("created", { kind: "order" });

  assert.deepEqual(ordersReceived, [{ kind: "order" }]);
  assert.deepEqual(invoicesReceived, []);
});

test("la fonction unsubscribe retournée par on() arrête bien la livraison", () => {
  const transport = new FakeTransport();
  const channel = new ChannelHandle(transport, "orders:42");

  const received: unknown[] = [];
  const unsubscribe = channel.on("order.created", (data) => received.push(data));

  channel.emit("order.created", { orderId: 1 });
  unsubscribe();
  channel.emit("order.created", { orderId: 2 });

  assert.deepEqual(received, [{ orderId: 1 }]);
});

test("on() expose aussi le RealtimeMessage brut en second argument", () => {
  const transport = new FakeTransport();
  const channel = new ChannelHandle(transport, "orders:42");

  let seenMessage: RealtimeMessage | undefined;
  channel.on("order.created", (_data, message) => {
    seenMessage = message;
  });
  channel.emit("order.created", { orderId: 1 });

  assert.equal(seenMessage?.channelId, "orders:42");
  assert.equal(typeof seenMessage?.receivedAt, "number");
});
