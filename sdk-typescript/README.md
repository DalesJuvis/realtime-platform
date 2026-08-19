# @yourorg/realtime-sdk

SDK client TypeScript/JavaScript pour le moteur de notification et
messagerie temps réel multi-tenant (protocole binaire fixe 256 octets).
Gère la reconnexion automatique, le heartbeat, le multiplexage des
souscriptions, et expose un pattern **Adapter** pour permuter vers
Firebase ou PubNub sans réécrire le code applicatif.

> **Statut** : projet démarré, non publié sur npm, non compilé/testé de
> bout en bout (pas d'accès réseau dans l'environnement où il a été
> écrit — `npm install` et `tsc` restent à lancer chez vous avant tout
> usage réel). Les tests unitaires du codec binaire (`src/protocol.test.ts`)
> couvrent la logique pure, sans dépendance réseau.

## Installation

```bash
npm install @yourorg/realtime-sdk
# En Node.js (hors v22+ expérimental), WebSocket n'est pas global :
npm install ws
```

## Démarrage rapide

```ts
import { createRealtimeClient } from "@yourorg/realtime-sdk";

const client = createRealtimeClient({
  url: "wss://realtime.example.com/ws",
  tenantId: "12345678-9abc-def0-1122-334455667788",
  token: monJetonEmisParLeServeur, // auth.rs::AuthManager::issue_token
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

En Node.js, injectez une implémentation `WebSocket` (le natif n'existe
que dans les navigateurs et React Native) :

```ts
import WebSocket from "ws";

const client = createRealtimeClient({
  url: "wss://realtime.example.com/ws",
  tenantId,
  token,
  webSocketImpl: WebSocket as any,
});
```

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

## Pattern Adapter — permuter vers Firebase/PubNub

Le code applicatif ne doit programmer que contre l'interface
`RealtimeAdapter` (`connect`, `disconnect`, `publish`, `subscribe`,
`unicast?`), jamais contre `RealtimeClient` directement. Le point de
bascule tient en une ligne, dans `createRealtimeClient()` :

```ts
// Moteur maison (par défaut)
const client: RealtimeAdapter = createRealtimeClient({ url, tenantId, token });

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
