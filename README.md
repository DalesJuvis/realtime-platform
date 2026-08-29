# realtime-platform

Moteur de notification et messagerie temps réel multi-tenant en Rust
(protocole binaire fixe 256 octets), avec ses SDKs clients pour huit
langages/plateformes/frameworks, un Portal API self-service, et deux
apps de référence (chat, administration).

## Contenu

```
backend/            Serveur Rust (Axum + Tokio) — cf. backend/Cargo.toml
sdk-typescript/      SDK JS/TS — navigateur, Node.js, React Native
sdk-react/           Bindings React (contexte, hooks, composants) sur sdk-typescript
sdk-react-native/    Bindings React Native (+ reconnexion AppState/réseau) sur sdk-react
sdk-rust/            SDK Rust (Tokio)
sdk-python/          SDK Python (asyncio)
sdk-android/         SDK Kotlin/Java — Android + JVM
sdk-wordpress/       Extension WordPress — client PHP (mint/publish/évènements HTTP) + shortcode JS live + mio-embed.js sans plugin
sdk-laravel/         Service provider + facade Laravel sur le même client PHP framework-independent que sdk-wordpress
vanilla-client/       Harnais de test local pour mio-embed.js (live-server, zéro dépendance)
web-client/          Client de chat + notifications (React/Vite/Tailwind/shadcn), PWA avec Web Push
admin/               Panneau d'administration plateforme (gestion des tenants)
tenant-portal/       Portail self-service tenant (signup, login, devices, clés API, facturation, canaux, templates), PWA
```

Chaque dossier a son propre `README.md` avec installation, démarrage
rapide, et limitations connues. [`DOCS.md`](DOCS.md) rassemble un
démarrage rapide par SDK en un seul fichier (même contenu que la page
Docs intégrée à `tenant-portal/`, avec des valeurs d'exemple à la place
de celles d'un tenant réel).

## Statut de validation

`backend/` est compilé, testé (87 tests `cargo test` passants, 2 tests
d'intégration Redis Streams marqués `#[ignore]` — nécessitent un Redis
local, voir `backend/src/modules/history/adapters/RedisStreamsHistoryAdapter.rs`)
et **déployé en production** (Docker, derrière un reverse-proxy partagé —
voir `backend/DEPLOY.md`). Une version antérieure de ce README décrivait
un environnement sans accès à Internet ni toolchain Rust, où rien n'avait
jamais été compilé — ce n'est plus le cas pour les composants listés
"compilé"/"testé" ci-dessous ; pour les autres, le statut historique est
gardé tel quel et reste à vérifier vous-même avant usage :

| Composant | Statut |
|---|---|
| `backend/` (Rust) | **Compilé, testé (87/89, 2 ignorés), déployé en production** |
| `sdk-typescript/` | **Compilé et testé** (`tsc` + `node --test`, 30/30) — inclut `client.channel()` (évènements nommés façon socket.io) |
| `sdk-wordpress/` | Client PHP **testé** (`composer test`, 12/12, PHPUnit contre un transport HTTP factice, `emitEvent()` inclus) ; codec + client WS JS **testés** (`npm test`, 23/23, `node --test`) ; intégration WordPress (routes REST, shortcode, page de réglages) non testée faute d'installation WordPress disponible |
| `sdk-laravel/` | `LaravelHttpTransport` **testé** (`composer test`, 3/3, contre un `Illuminate\Http\Client\Factory` factice) ; service provider/facade non vérifiés contre une vraie app Laravel démarrée |
| `sdk-react/` | Compilé (`npm install` + `tsc` strict, sans erreur) ; hooks non testés au runtime contre un vrai serveur/une vraie app React |
| `sdk-react-native/` | Compilé (`npm install` + `tsc` strict, avec `react-native` comme devDependency de typage) ; reconnexion `AppState` non testée sur appareil/simulateur réel |
| `sdk-rust/` | Écrit, jamais compilé *(statut historique — à revérifier)* |
| `sdk-python/` | Codec (`protocol.py`) testé (13/13, stdlib pur) ; client réseau (`client.py`, dépend de `websockets`) non testé faute d'installation possible *(statut historique — à revérifier)* |
| `sdk-android/` | Écrit, jamais compilé (ni `kotlinc` ni JDK complet disponibles au moment de l'écriture) *(statut historique — à revérifier)* |

Chaque README de sous-dossier détaille précisément ce qui a été vérifié
et ce qui ne l'a pas été.

## Ordre de mise en route suggéré

1. `cd backend && cargo build` — déjà validé (voir le tableau ci-dessus),
   mais vérifiez chez vous après tout changement local.
2. `docker compose up` (fichier fourni dans `backend/`) pour valider le
   broadcast multi-instances (2 instances + Redis) en local, ou
   `docker-compose.shared-proxy.yml` pour un déploiement VPS derrière un
   reverse-proxy déjà en place (voir `backend/DEPLOY.md`).
3. Brancher un SDK client contre le serveur réel, en commençant par
   `sdk-typescript/` (déjà validé côté codec et côté client réel, y
   compris `client.channel()`).
4. Pour les SDKs "jamais compilés" au tableau ci-dessus : les compiler et
   les tester réellement dans leur écosystème avant tout usage en
   production.

## Protocole (rappel)

Frame binaire fixe de 256 octets, partagé par tous les SDKs et le
serveur — voir `backend/src/entities/Frame.rs` pour la référence
normative (tous les SDKs en sont des transpositions fidèles) :

```text
0..2      Magic + version (0xAA01)
2..3      Opcode (SUB=0x01, PUB=0x02, MSG=0x03, AUTH=0x04, PING=0x05,
                  PRESENCE=0x06, REPLAY=0x07, UNICAST=0x08, UNSUB=0x09)
3..19     Tenant ID (UUID, 16 octets)
19..43    Channel ID (UTF-8, 24 octets, paddé à zéro)
43..254   Payload (UTF-8, 211 octets, paddé à zéro)
254..256  CRC16/CCITT-FALSE
```

## Fonctionnalités serveur

Historique/rattrapage (ring buffer en mémoire par défaut, ou Redis
Streams durable si `REDIS_URL` est configuré — voir
`backend/src/modules/history/`), rate limiting (Token Bucket par
session/tenant), Admin API (gestion de tenants à chaud, port séparé),
broadcast multi-instances (Redis Pub/Sub), wildcard channels
(`orders:*`), métriques Prometheus (`/metrics`), unicast user-to-user,
désabonnement réseau réel (UNSUB), Web Push chiffré (VAPID, fallback
automatique quand personne n'est connecté localement), et un Portal API
self-service complet — signup, plusieurs paires de clés API
indépendamment révocables (en plus du secret primaire du tenant),
canaux, templates de message, broadcast — cf. les commentaires de tête
de chaque module source (`backend/src/modules/portal/`, notamment).
