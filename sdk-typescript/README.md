# @mio/realtime-sdk

SDK client TypeScript/JavaScript pour le moteur de notification et
messagerie temps réel multi-tenant (protocole binaire fixe 256 octets).
Gère la reconnexion automatique, le heartbeat, le multiplexage des
souscriptions, et expose un pattern **Adapter** pour permuter vers
Firebase ou PubNub sans réécrire le code applicatif.

> **Statut** : compilé et validé de bout en bout contre un backend réel
> (docker-compose, `engine-a`/`engine-b`) depuis `web-client/`, `admin/`
> et `tenant-portal/` dans ce repo. Les tests unitaires du codec binaire
> (`src/protocol.test.ts`) couvrent la logique pure, sans dépendance réseau.

## Installation

```bash
npm install @mio/realtime-sdk
# En Node.js (hors v22+ expérimental), WebSocket n'est pas global : ce
# paquet optionnel suffit — le SDK le charge lui-même, aucun `import "ws"`
# à écrire dans votre code (voir plus bas).
npm install ws
```

## Démarrage rapide

```ts
import { createRealtimeClient } from "@mio/realtime-sdk";

const client = createRealtimeClient({
  wsUrl: monWsUrlEmisParLeServeur, // le `ws_url` de la réponse de mint-token, jamais assemblé à la main
  tenantId: "12345678-9abc-def0-1122-334455667788",
  token: monJetonEmisParLeServeur, // voir "Authentification HTTP" plus bas
});

const unsubscribe = client.subscribe("orders:42", (message) => {
  console.log(message.channelId, message.payload);
});

client.connect();
client.publish("orders:42", "commande créée");

// Plus tard :
unsubscribe();
client.disconnect();
```

`wsUrl` est obligatoire et vient tel quel du `ws_url` retourné par
`/api/v1/auth/tokens` (voir "Authentification HTTP" plus bas) — le SDK
n'assemble plus jamais d'URL à partir d'un `host`/`port`/`secure`. En
production, l'endpoint WS partage le même domaine que l'API REST, sans
port (`wss://exemple.com/ws`), ce qu'un défaut côté SDK ne pourrait pas
deviner correctement.

En Node.js, aucune ligne de plus à écrire : ni `import WebSocket from
"ws"`, ni `webSocketImpl` — le SDK détecte l'absence de `WebSocket`
global et charge le paquet optionnel `ws` lui-même à la volée. `npm
install ws` (fait une seule fois, ci-dessus) est la seule étape encore
nécessaire côté Node ; `webSocketImpl` ne sert plus qu'à imposer une
implémentation précise (tests, environnement exotique).

## Fonctionnalités

| Fonctionnalité | API |
|---|---|
| Publication | `client.publish(channelId, payload)` |
| Publication d'un template sauvegardé (tenant-portal → Templates) | `client.publishTemplate(channelId, templateId, variables?)` |
| Souscription (canal exact) | `client.subscribe(channelId, handler)` |
| Souscription (motif `orders:*`) | `client.subscribe("orders:*", handler)` |
| Envoi direct à un utilisateur | `client.unicast(userId, payload)` |
| Rattrapage d'historique | `client.replay(channelId, sinceUnixSeconds?)` |
| Évènements nommés façon socket.io | `client.channel(channelId).on(event, handler)` / `.emit(event, data)` |
| Évènements de connexion | `client.on("open" \| "close" \| "error" \| "authenticated" \| "authFailed" \| "message", ...)` |
| Notification d'onglet en arrière-plan | `attachBackgroundNotifications(client, options?)` |
| Abonnement Web Push (onglet/navigateur fermé) | `registerPushServiceWorker(url)` + `subscribeToPush(registration, vapidPublicKey)` |

Reconnexion automatique (backoff exponentiel + jitter, configurable),
heartbeat PING périodique, et ré-abonnement transparent à tous les
canaux actifs après une reconnexion — rien à orchestrer manuellement.

## Évènements nommés façon socket.io — `client.channel()`

`client.publish()`/`.subscribe()` échangent une chaîne brute — suffisant
pour un canal à un seul type de message, mais un canal qui porte
plusieurs types d'évènements (`order.created`, `order.cancelled`, ...)
finit vite par réinventer un petit routage à la main dans le handler.
`client.channel(channelId)` donne une poignée scoped-à-ce-canal avec
`.on(event, handler)`/`.emit(event, data)`, dans l'esprit socket.io :

```ts
const orders = client.channel("orders:42");

orders.on<{ orderId: number }>("order.created", (data) => {
  console.log("nouvelle commande", data.orderId);
});
orders.on("order.cancelled", (data) => {
  console.log("commande annulée", data);
});

orders.emit("order.created", { orderId: 123 });
```

**Pas un changement de protocole** — `.emit(event, data)` est un
`publish()` classique dont le payload encode `{"event": "...", "data": ...}`
en JSON ; `.on(event, handler)` filtre les messages reçus sur ce
`channelId` pour ne livrer que ceux dont l'enveloppe correspond. Hérite
donc gratuitement du découpage en chunks transparent de `publish()` pour
un `data` volumineux, et plusieurs `.on()` sur des évènements différents
du même canal partagent un seul abonnement réseau (`subscribe()`
dédoublonne déjà le frame SUB par canal).

`client.on()`/`.off()` (sans argument `channelId`) restent réservés aux
évènements de connexion (`"open"`, `"close"`, `"error"`, `"authenticated"`,
`"authFailed"`, `"message"`) — volontairement une API séparée, pas une surcharge du même
nom, pour ne jamais confondre "le canal reçoit tel évènement applicatif"
et "la connexion elle-même vient de s'ouvrir/fermer". Un `publish()`
brut (une chaîne quelconque, un autre SDK qui n'utilise pas cette
convention) sur le même canal n'interfère pas : `.on()` l'ignore
silencieusement plutôt que de planter sur du JSON inattendu — utilisez
`client.subscribe()` directement pour voir tout message brut, quelle que
soit sa forme.

Réception d'un évènement émis côté serveur (PHP `Client::emitEvent()`,
voir `sdk-wordpress`/`sdk-laravel`) : même enveloppe JSON, donc
`client.channel(id).on(event, handler)` le reçoit exactement pareil,
cross-SDK, sans rien à changer ni d'un côté ni de l'autre.

## Authentification HTTP avant connexion

Ce SDK n'émet jamais de jeton lui-même — un jeton signé HMAC ne doit être
généré que côté serveur, qui seul détient le secret du tenant (jamais
dans un navigateur/mobile). Le backend expose pour ça une route HTTP
publique, pensée pour être appelée **par le backend du tenant lui-même**
(jamais directement depuis un client final) juste avant que celui-ci ne
remette le jeton à son utilisateur :

```http
POST /api/v1/auth/tokens
Content-Type: application/json

{ "tenant_id": "...", "secret": "...", "sub": "user-42", "ttl_secs": 3600 }
```

```json
{ "success": true, "data": { "token": "…", "expires_in": 3600, "ws_url": "wss://realtime.example.com/ws" }, "trace_id": "…" }
```

`ws_url` est dérivé par le serveur lui-même à partir du domaine de cette
requête (ou d'une configuration explicite côté opérateur) — jamais
fourni par l'appelant. Séquence complète :
[`diagrams/auth/issue-client-token/version.md`](../diagrams/auth/issue-client-token/version.md).
`secret` n'authentifie que cette requête HTTP — il
ne circule jamais vers le client final, qui ne reçoit que `token` et
`ws_url` :

```ts
// Côté backend du tenant (jamais dans le navigateur) :
const res = await fetch("https://realtime.example.com:8090/api/v1/auth/tokens", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tenant_id, secret, sub: userId }),
});
const { data } = await res.json();

// `token` et `ws_url` sont renvoyés au client final, qui s'en sert ici :
const client = createRealtimeClient({ wsUrl: data.ws_url, tenantId, token: data.token });
```

## Publier un message via HTTP (sans connexion persistante)

Pour un backend qui n'a pas de socket ouvert en permanence (ex. un job qui
notifie un canal une fois de temps en temps), `POST /api/v1/messages`
publie un message sans passer par le SDK ni par une connexion WS/TCP.
Authentification par jeton client déjà émis (`Authorization: Bearer`),
jamais par le secret brut du tenant :

```http
POST /api/v1/messages
Content-Type: application/json
Authorization: Bearer <token émis par /api/v1/auth/tokens>

{ "tenant_id": "...", "channel_id": "orders:42", "payload": "commande créée" }
```

```json
{ "success": true, "data": { "published": true }, "trace_id": "…" }
```

**Limitation assumée :** contrairement à `client.publish()` côté SDK, cette
route HTTP ne chunk pas — le `payload` doit tenir dans les 211 octets d'un
seul frame (`400 INVALID_REQUEST` sinon). Un appelant avec des messages
plus grands doit les découper lui-même en plusieurs appels, ou utiliser un
client SDK connecté. Comme pour la connexion WS/TCP, un tenant qui dépasse
son quota (`RateLimitService`, bucket partagé par tenant — pas de notion
de session pour un appel HTTP sans état) reçoit `429 RATE_LIMITED`.

## Messages plus grands qu'un frame

Le frame reste toujours exactement 256 octets (211 de payload utile) —
`publish()`/`unicast()` n'imposent aucune limite de taille pratique
au-delà de ça : un payload trop grand pour un seul frame est
automatiquement découpé en plusieurs frames PUB/UNICAST successifs et
réassemblé côté récepteur, avant que `subscribe()` ne le voie. Rien à
changer dans le code applicatif :

```ts
client.publish("logs:app", hugeJsonBlob); // fonctionne quelle que soit la taille (jusqu'à maxMessageBytes)
```

Garde-fou par défaut : 64 Kio (`DEFAULT_MAX_MESSAGE_BYTES`), ajustable
via `maxMessageBytes` — ce n'est pas une limite protocolaire, juste une
protection contre un appel malencontreux avec un payload énorme.

**Limitation connue :** `replay()` récupère l'historique frame par
frame depuis un ring buffer de capacité fixe côté serveur — si certains
chunks d'un message ont été évincés avant les autres, il ne sera jamais
réassemblé au rattrapage. Un message qui tient dans un seul frame n'a
pas ce problème.

## Notifications navigateur

Deux niveaux, deux garanties différentes — voir la doc de tête de
`src/notifications.ts` pour le détail :

```ts
import {
  attachBackgroundNotifications,
  requestNotificationPermission,
  registerPushServiceWorker,
  subscribeToPush,
} from "@mio/realtime-sdk";

// 1. Onglet ouvert mais caché/sans focus — fonctionne dès aujourd'hui,
//    aucune infrastructure serveur nécessaire.
await requestNotificationPermission(); // sur un clic utilisateur
attachBackgroundNotifications(client);

// 2. Onglet fermé, voire navigateur pas lancé — nécessite un Service
//    Worker (public/sw.js dans votre app) et un backend qui envoie un
//    vrai Web Push chiffré à l'abonnement obtenu ici (voir
//    backend/src/modules/push/services/WebPushCrypto.rs et
//    POST /api/v1/push/subscriptions dans ce repo pour un exemple complet).
const registration = await registerPushServiceWorker("/sw.js");
const subscription = await subscribeToPush(registration, vapidPublicKey);
// POSTez `subscription` ({ endpoint, keys: { p256dh, auth } }) à votre backend.
```

**Ce que `subscribeToPush()` ne garantit pas :** un navigateur réellement
quitté (pas juste l'onglet fermé) ne reçoit rien tant que l'OS/le
navigateur ne le réveille pas pour traiter le push — hors du contrôle de
ce SDK et du serveur qui envoie le Web Push.

## Pattern Adapter — permuter vers Firebase/PubNub

Le code applicatif ne doit programmer que contre l'interface
`RealtimeAdapter` (`connect`, `disconnect`, `publish`, `subscribe`,
`unicast?`), jamais contre `RealtimeClient` directement. Le point de
bascule tient en une ligne, dans `createRealtimeClient()` :

```ts
// Moteur maison (par défaut)
const client: RealtimeAdapter = createRealtimeClient({ wsUrl, tenantId, token });

// Firebase (gabarit à compléter, voir src/adapters/firebase-adapter.ts)
const client: RealtimeAdapter = new FirebaseAdapter({ firebaseConfig, basePath });

// PubNub (gabarit à compléter, voir src/adapters/pubnub-adapter.ts)
const client: RealtimeAdapter = new PubNubAdapter({ publishKey, subscribeKey, userId });
```

**Important :** `src/adapters/firebase-adapter.ts` et
`src/adapters/pubnub-adapter.ts` sont des **gabarits non implémentés** —
leurs méthodes lèvent une erreur explicite tant qu'elles n'ont pas été
complétées et testées contre un vrai compte Firebase/PubNub. Ce n'était
pas possible à valider dans l'environnement où ce SDK a été écrit (pas
d'accès réseau pour installer et vérifier ces SDK tiers). Chaque fichier
documente le mapping de concepts prévu (canal ↔ nœud RTDB / canal PubNub)
et le code d'implémentation indicatif en commentaire, prêt à être
décommenté et ajusté.

## Format binaire (rappel)

Chaque frame fait exactement 256 octets — voir `src/protocol.ts`, qui
doit rester en miroir strict de `protocol.rs` côté serveur :

```text
0..2      Magic + version (0xAA01)
2..3      Opcode
3..19     Tenant ID (UUID, 16 octets)
19..43    Channel ID (UTF-8, 24 octets, paddé à zéro)
43..254   Payload (UTF-8, 211 octets, paddé à zéro)
254..256  CRC16/CCITT-FALSE
```

Ce SDK ne devrait normalement jamais avoir besoin d'être manipulé à ce
niveau par le code applicatif — `client.ts` encapsule entièrement
l'encodage/décodage.

## Limitations connues (documentées, pas cachées)

- **`replay()` ne fonctionne pas sur un motif** (`orders:*`) : l'historique
  serveur est indexé par canal exact, pas par motif. Le serveur ignore
  silencieusement la demande (log côté serveur uniquement).
- **`unicast()` exige un `userId` ≤ 24 octets UTF-8** — c'est le champ
  `channelId` du frame, repurposé, qui le porte. Un UUID v4 en texte (36
  caractères) ne rentre pas : utilisez un identifiant court dédié à
  l'adressage socket si vos IDs utilisateur sont des UUIDs.
- **`publishTemplate()` passe par HTTP, pas le socket ouvert** — le
  protocole 256 octets n'a aucune notion de template. Fonctionne donc
  même sans connexion WS active (tant qu'un jeton est disponible), mais
  contrairement à `publish()`/`unicast()` ce n'est pas mis en file
  d'attente avant l'ouverture du socket : chaque appel part
  immédiatement. Le `templateId` doit appartenir au même tenant que le
  jeton, sinon `404 TEMPLATE_NOT_FOUND` ; une valeur absente pour une
  `{{variable}}` du template rend une chaîne vide, pas le placeholder.
- **Pas d'accusé de réception AUTH.** Le protocole actuel n'a pas
  d'opcode d'ACK explicite : l'évènement `authenticated` est émis de
  façon optimiste juste après l'envoi du frame AUTH. En cas d'échec
  d'authentification (jeton invalide ou expiré), le serveur ferme la
  connexion avec un code WS dédié (`4001`) — observez l'évènement
  `authFailed` plutôt qu'un `close` générique pour détecter précisément ce
  cas. Sans `getToken` configuré (voir la section dédiée ci-dessous), le
  client ne retente **jamais** automatiquement après un `authFailed`,
  même avec `reconnect: true` : retenter avec le même jeton échouerait à
  nouveau, indéfiniment. Minez un nouveau jeton et reconstruisez un
  `RealtimeClient` plutôt que de compter sur la reconnexion automatique
  ici — ou configurez `getToken` pour que ça se fasse tout seul.

## Renouvellement silencieux du jeton — `getToken`

Un jeton expire (1h par défaut, jusqu'à 30 jours si miné avec un
`ttl_secs` plus long). `config.token` est une valeur statique : une fois
expirée, sans intervention, la connexion reste fermée (voir `authFailed`
ci-dessus). Si votre application a son propre backend capable de miner un
jeton à la demande (lui-même appelant `POST /api/v1/auth/tokens` avec le
secret tenant — **jamais ce SDK, jamais le navigateur**), remplacez
`token` par `getToken` :

```ts
const client = createRealtimeClient({
  wsUrl: "wss://realtime.example.com/ws", // valeur de repli — le ws_url renvoyé par getToken() prend le dessus
  tenantId: "<tenant-id>",
  getToken: async () => {
    // Appelle VOTRE backend, jamais l'API mio directement depuis ce client.
    const res = await fetch("/api/realtime-token", { method: "POST" });
    const { token, wsUrl } = await res.json();
    return { token, wsUrl }; // wsUrl optionnel — omis, celui déjà configuré est réutilisé
  },
});
```

`getToken()` est appelé avant *chaque* tentative de connexion — le
premier `connect()`, et automatiquement à chaque reconnexion, y compris
juste après un `authFailed`. Résultat : le renouvellement est silencieux
pour le reste du code applicatif une fois configuré ici. Un rejet
(`getToken()` qui lève) est traité comme n'importe quel autre échec de
connexion — `error` émis, reconnexion replanifiée avec le même backoff
exponentiel que le reste, jamais de boucle serrée si votre backend est
temporairement indisponible.

`token` et `getToken` sont mutuellement exclusifs — le type
`RealtimeClientConfig` l'impose à la compilation.

*Résolu depuis la v0.1 : `unsubscribe()` envoie désormais un vrai frame
UNSUB (`Opcode 0x09`) au serveur — ce n'est plus un silence purement
côté client.*

## Développement

```bash
npm install
npm run build   # compile src/ -> dist/
npm test        # tests du codec binaire (node --test)
```
