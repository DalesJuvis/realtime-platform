# @yourorg/realtime-sdk

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
npm install @yourorg/realtime-sdk
# En Node.js (hors v22+ expérimental), WebSocket n'est pas global : ce
# paquet optionnel suffit — le SDK le charge lui-même, aucun `import "ws"`
# à écrire dans votre code (voir plus bas).
npm install ws
```

## Démarrage rapide

```ts
import { createRealtimeClient } from "@yourorg/realtime-sdk";

const client = createRealtimeClient({
  host: "realtime.example.com",
  secure: true, // wss:// au lieu de ws:// — construit en interne, jamais à écrire à la main
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

`host` (+ `port`, défaut 8080 ; `path`, défaut `/ws`) suffit dans
l'immense majorité des cas — `url` reste une échappatoire pour un besoin
avancé (proxy, chemin non standard), mais **jamais les deux à la fois**.

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
| Souscription (canal exact) | `client.subscribe(channelId, handler)` |
| Souscription (motif `orders:*`) | `client.subscribe("orders:*", handler)` |
| Envoi direct à un utilisateur | `client.unicast(userId, payload)` |
| Rattrapage d'historique | `client.replay(channelId, sinceUnixSeconds?)` |
| Évènements de connexion | `client.on("open" \| "close" \| "error" \| "authenticated" \| "message", ...)` |

Reconnexion automatique (backoff exponentiel + jitter, configurable),
heartbeat PING périodique, et ré-abonnement transparent à tous les
canaux actifs après une reconnexion — rien à orchestrer manuellement.

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
{ "success": true, "data": { "token": "…", "expires_in": 3600 }, "trace_id": "…" }
```

`secret` n'authentifie que cette requête HTTP — il ne circule jamais vers
le client final, qui ne reçoit que le `token` résultant :

```ts
// Côté backend du tenant (jamais dans le navigateur) :
const res = await fetch("https://realtime.example.com:8090/api/v1/auth/tokens", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tenant_id, secret, sub: userId }),
});
const { data } = await res.json();

// Le `token` seul est renvoyé au client final, qui s'en sert ici :
const client = createRealtimeClient({ host, tenantId, token: data.token });
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

## Pattern Adapter — permuter vers Firebase/PubNub

Le code applicatif ne doit programmer que contre l'interface
`RealtimeAdapter` (`connect`, `disconnect`, `publish`, `subscribe`,
`unicast?`), jamais contre `RealtimeClient` directement. Le point de
bascule tient en une ligne, dans `createRealtimeClient()` :

```ts
// Moteur maison (par défaut)
const client: RealtimeAdapter = createRealtimeClient({ host, tenantId, token });

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
- **Pas d'accusé de réception AUTH.** Le protocole actuel n'a pas
  d'opcode d'ACK explicite : l'évènement `authenticated` est émis de
  façon optimiste juste après l'envoi du frame AUTH. En cas d'échec
  d'authentification, le serveur ferme simplement la connexion — observez
  plutôt l'évènement `close` pour détecter ce cas.

*Résolu depuis la v0.1 : `unsubscribe()` envoie désormais un vrai frame
UNSUB (`Opcode 0x09`) au serveur — ce n'est plus un silence purement
côté client.*

## Développement

```bash
npm install
npm run build   # compile src/ -> dist/
npm test        # tests du codec binaire (node --test)
```
