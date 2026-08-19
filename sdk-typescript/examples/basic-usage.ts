/**
 * `examples/basic-usage.ts` — Utilisation minimale du SDK.
 *
 * Exécution en Node.js : nécessite le paquet `ws` (`npm install ws`) car
 * Node < 22 n'a pas de `WebSocket` global.
 */

import WebSocket from "ws";
import { createRealtimeClient } from "../src/index.js";

const client = createRealtimeClient({
  url: "wss://realtime.example.com/ws",
  tenantId: "12345678-9abc-def0-1122-334455667788",
  // Jeton émis côté serveur — jamais généré côté client.
  token: process.env.REALTIME_TOKEN ?? "",
  webSocketImpl: WebSocket as unknown as new (url: string) => import("../src/client.js").WebSocketLike,
});

client.subscribe("orders:42", (message) => {
  console.log(`[orders:42] ${message.payload}`);
});

// Souscription par motif : reçoit tout ce qui matche `orders:*`.
client.subscribe("orders:*", (message) => {
  console.log(`[wildcard orders:*] ${message.channelId} -> ${message.payload}`);
});

client.connect();

setTimeout(() => {
  client.publish("orders:42", "commande créée");
  client.unicast("user-789", "message direct");
  client.replay("orders:42", 0); // rattrape tout l'historique disponible
}, 1000);
