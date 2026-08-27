# realtime-platform

Moteur de notification et messagerie temps réel multi-tenant en Rust
(protocole binaire fixe 256 octets), avec ses SDKs clients pour quatre
langages/plateformes.

## Contenu

```
backend/            Serveur Rust (Axum + Tokio) — cf. backend/Cargo.toml
sdk-typescript/      SDK JS/TS — navigateur, Node.js, React Native
sdk-react/           Bindings React (contexte, hooks, composants) sur sdk-typescript
sdk-react-native/    Bindings React Native (+ reconnexion AppState/réseau) sur sdk-react
sdk-rust/            SDK Rust (Tokio)
sdk-python/          SDK Python (asyncio)
sdk-android/         SDK Kotlin/Java — Android + JVM
web-client/          Client de chat + notifications (React/Vite/Tailwind/shadcn)
admin/               Panneau d'administration plateforme (gestion des tenants)
tenant-portal/       Portail self-service tenant (login, devices, jetons)
```

Chaque dossier a son propre `README.md` avec installation, démarrage
rapide, et limitations connues.

## Statut de validation — à lire avant de faire confiance à quoi que ce soit ici

Cet environnement de développement n'avait accès ni à Internet, ni à un
toolchain Rust (`cargo`/`rustc`), ni à un JDK complet (`javac`)/`kotlinc`.
Seuls Node.js/TypeScript et Python étaient disponibles avec leurs
toolchains. Résultat, par composant :

| Composant | Statut réel |
|---|---|
| `backend/` (Rust) | Écrit, **jamais compilé** — `cargo build` à faire en premier |
| `sdk-typescript/` | **Compilé et testé** (`tsc` + `node --test`, 10/10) |
| `sdk-react/` | **Compilé** (`npm install` + `tsc` strict, sans erreur) ; hooks non testés au runtime contre un vrai serveur/une vraie app React |
| `sdk-react-native/` | **Compilé** (`npm install` + `tsc` strict, avec `react-native` comme devDependency de typage) ; reconnexion `AppState` non testée sur appareil/simulateur réel |
| `sdk-rust/` | Écrit, **jamais compilé** |
| `sdk-python/` | Codec (`protocol.py`) **testé** (13/13, stdlib pur) ; client réseau (`client.py`, dépend de `websockets`) non testé faute d'installation possible |
| `sdk-android/` | Écrit, **jamais compilé** (ni `kotlinc` ni JDK complet disponibles) |

Chaque README de sous-dossier détaille précisément ce qui a été vérifié
et ce qui ne l'a pas été. Avant toute mise en production : `cargo build`
sur `backend/` et `sdk-rust/`, `./gradlew build test` sur `sdk-android/`,
`pip install websockets` puis test réel de `sdk-python/client.py`.

## Ordre de mise en route suggéré

1. `cd backend && cargo build` — corriger les éventuelles erreurs de compilation.
2. `docker compose up` (fichier fourni dans `backend/`) pour valider le
   broadcast multi-instances (2 instances + Redis).
3. Brancher un SDK client contre le serveur réel, en commençant par
   `sdk-typescript/` (déjà validé côté codec).
4. Compiler et tester les trois autres SDKs dans leurs écosystèmes
   respectifs.

## Protocole (rappel)

Frame binaire fixe de 256 octets, partagé par les quatre SDKs et le
serveur — voir `backend/src/protocol.rs` pour la référence normative
(tous les SDKs en sont des transpositions fidèles) :

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

Historique/rattrapage (ring buffer + REPLAY), rate limiting (Token
Bucket par session/tenant), Admin API (gestion de tenants à chaud, port
séparé), broadcast multi-instances (Redis Pub/Sub), wildcard channels
(`orders:*`), métriques Prometheus (`/metrics`), unicast user-to-user,
et désabonnement réseau réel (UNSUB) — cf. `backend/README` implicite
dans les commentaires de tête de chaque module source.
