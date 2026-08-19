# Realtime Platform — Résumé du projet

Moteur de notification et messagerie temps réel multi-tenant en Rust
(protocole binaire fixe 256 octets), avec quatre SDKs clients
(TypeScript, Rust, Python, Android Kotlin/Java).

---

## 1. Vue d'ensemble

| | |
|---|---|
| **Backend** | Rust — Axum (WebSocket + REST) + Tokio (TCP brut) |
| **Protocole** | Frame binaire fixe de 256 octets, CRC16/CCITT-FALSE |
| **Multi-tenant** | Isolation stricte par tuple `(TenantId, ChannelId)` |
| **SDKs clients** | TypeScript, Rust, Python, Android (Kotlin/Java) |
| **Déploiement** | Docker multi-stage, `scratch`, < 20 Mo |
| **Scaling** | Broadcast inter-instances via Redis Pub/Sub (optionnel) |

---

## 2. Le protocole binaire

Partagé à l'identique par le serveur et les 4 SDKs — c'est le contrat central du projet.

```text
Offset    Taille   Champ
0..2      2        Magic + Version (0xAA01)
2..3      1        Opcode
3..19     16       Tenant ID (UUID brut)
19..43    24       Channel ID (UTF-8, paddé à zéro)
43..254   211      Payload (UTF-8, paddé à zéro)
254..256  2        CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF)
```

### Opcodes

| Code | Nom | Rôle |
|---|---|---|
| `0x01` | SUBSCRIBE | Abonnement à un canal exact ou un motif (`orders:*`) |
| `0x02` | PUBLISH | Publication sur un canal |
| `0x03` | MESSAGE | Relais serveur → client (jamais émis par le client) |
| `0x04` | AUTH | Authentification (payload = jeton HMAC) |
| `0x05` | PING | Heartbeat |
| `0x06` | PRESENCE | Évènements JOIN/LEAVE/TIMEOUT (serveur → client) |
| `0x07` | REPLAY | Rattrapage d'historique (payload = timestamp Unix) |
| `0x08` | UNICAST | Envoi direct à un utilisateur (`channel_id` repurposé = ID destinataire) |
| `0x09` | UNSUB | Désabonnement explicite d'un canal ou motif |

### Détails d'implémentation notables

- **Zero-copy côté serveur** : `Frame<'a>` emprunte le buffer, aucune allocation au parsing.
- **Troncature sûre** : `channel_id`/`payload` trop longs sont tronqués sur une frontière de caractère UTF-8 valide (jamais de caractère coupé en deux), aussi bien à l'écriture qu'à la lecture.
- **CRC16 en boucle bit-à-bit** (pas de table de lookup) : garde le binaire léger pour la cible Docker `scratch`.

---

## 3. Backend Rust — modules et fonctionnalités

### `protocol.rs`
Encodeur/décodeur du frame. `Frame::parse` valide dans l'ordre : longueur → magic → opcode → CRC16 → UTF-8. `FrameBuilder` pour l'encodage sortant.

### `state.rs`
- **`MultiTenantRouter`** : un `broadcast::Sender` + un historique par canal (`DashMap<ChannelKey, ChannelState>`), isolation stricte par tenant à chaque `subscribe`/`publish`.
- **Historique & Replay** : `HistoryBuffer` (ring buffer `VecDeque`, capacité 50 par défaut) horodaté ; `router.replay(tenant, key, since_unix_secs)` renvoie tous les frames publiés après ce timestamp.
- **Wildcard channels** : `WildcardKey{tenant_id, pattern}`, `glob_match()` (backtracking simple, `*` = n'importe quelle sous-chaîne), fan-out inclus dans `publish()`.
- **`PresenceEngine`** : suit `last_seen` par session, `track_channel`/`untrack_channel`, `sweep_expired()` pour les timeouts.

### `auth.rs`
Jeton HMAC-SHA256 compact (`payload_base64.signature_base64`, pas un JWT complet — évite la classe de faille "alg: none"). Secrets par tenant dans une `DashMap` → lookup + vérification en **O(1)**. Comparaison de signature en temps constant (`Mac::verify_slice`). Le tenant encodé dans le jeton est croisé avec le tenant annoncé dans l'enveloppe du frame (anti-rejeu cross-tenant).

### `presence.rs`
Évènements **JOIN** (à l'AUTH), **LEAVE** (déconnexion propre ou UNSUB explicite d'un canal), **TIMEOUT** (sweep périodique, toutes les 5s par défaut). Chaque évènement est publié sur le méta-canal `{channel}-presence`.

### `push.rs`
Fallback FCM quand une publication n'a **aucun abonné socket actif**. Découplé du chemin chaud via `mpsc` (capacité 4096) : la latence/erreurs FCM ne ralentissent jamais la publication temps réel. Job abandonné (pas d'attente) si la file est pleine.

### `rate_limit.rs`
Anti-abus **Token Bucket**, O(1), à deux niveaux :
- **par session** (protège contre un client individuel qui flood) ;
- **par tenant** (protège contre un tenant entier via plusieurs connexions).

Vérifié *avant même l'AUTH* pour bloquer le flood pré-authentification. Quotas ajustables **à chaud par tenant** via l'Admin API (`set_tenant_limits`).

### `admin.rs`
API REST interne, **port séparé (9090)**, protégée par `Authorization: Bearer <ADMIN_API_TOKEN>` (comparaison en temps constant).

| Route | Effet |
|---|---|
| `POST /tenants` | Crée un tenant (UUID + secret 256 bits générés si absents) |
| `DELETE /tenants/:id` | Révoque auth + quotas |
| `PUT /tenants/:id/secret` | Rotation de secret |
| `PUT /tenants/:id/limits` | Ajuste les quotas de rate limiting |
| `GET /metrics` | Scraping Prometheus (non authentifié, usage standard) |
| `GET /healthz` | Sonde de vie |

### `cluster.rs`
Broadcast **multi-instances** via Redis Pub/Sub, activé seulement si `REDIS_URL` est défini (sinon mode single-instance, zéro dépendance Redis). Chaque instance publie une enveloppe `{origin_instance_id, frame}` sur un canal Redis unique et s'y abonne ; un message reçu avec `origin == self` est ignoré (déjà délivré localement en direct).

⚠️ **Limite documentée** : le fallback push se décide sur le nombre d'abonnés *locaux* uniquement — en cluster, ça peut déclencher un push FCM redondant si l'instance qui reçoit le PUB n'a pas d'abonné local alors qu'une autre instance en a.

### `metrics.rs`
Registre Prometheus : connexions actives (WS/TCP séparées), `messages_total{tenant_id,opcode}`, `frame_processing_seconds{opcode}` (histogramme), `push_fallback_total{tenant_id}`, `rate_limited_total{tenant_id}`.

### `main.rs`
Assemble trois serveurs partageant le même `AppState` :
- **WebSocket** (Axum, port 8080)
- **TCP brut** (Tokio, port 7878, sans overhead HTTP/WS)
- **Admin API** (port 9090)

`Command` enum (`Subscribed(key, rx)`, `Unsubscribed(key)`, `Replayed(frames)`, `None`, `Close`) unifie la logique entre WS et TCP. `relay_tasks` est une `HashMap<String, JoinHandle>` indexée par canal : un UNSUB `abort()` précisément la bonne tâche de relais, sans affecter les autres abonnements du socket. Auto-abonnement à la boîte privée `user:{sub}` dès l'AUTH réussi (pour recevoir des UNICAST sans SUB explicite). Arrêt propre sur SIGINT/SIGTERM.

### Déploiement
- **`Dockerfile`** : build multi-stage `x86_64-unknown-linux-musl`, image finale `scratch`, cible < 20 Mo, utilisateur non-root.
- **`docker-compose.yml`** : 2 instances + Redis, pour valider le broadcast multi-instances en local.

---

## 4. SDKs clients

Les 4 SDKs partagent la même architecture : `protocol.*` (codec, sans dépendance réseau) + `client.*` (connexion, reconnexion, heartbeat). Mêmes opérations partout : `publish`, `subscribe` (canal ou motif), `unsubscribe`, `unicast`, `replay`.

### Fonctionnalités communes aux 4 SDKs
- **Reconnexion automatique** : backoff exponentiel + jitter ±20% (évite l'effet troupeau).
- **Heartbeat** PING périodique (15s par défaut).
- **Ré-abonnement transparent** à tous les canaux actifs après une reconnexion.
- **UNSUB réseau réel** : envoie le frame `0x09`, la tâche de relais serveur est effectivement arrêtée (pas un silence local).
- **Souscription par motif** (`orders:*`) avec correspondance glob côté client (le serveur ne renvoie que le canal concret réel).

### SDK TypeScript (`sdk-typescript/`)
- Cible navigateur / Node.js / React Native.
- Pattern **Adapter** : interface `RealtimeAdapter` découple le code applicatif du transport — gabarits `FirebaseAdapter`/`PubNubAdapter` fournis (honnêtement marqués non implémentés, avec le mapping de concepts documenté).
- `createRealtimeClient()` = point de bascule à une ligne entre moteur maison et adaptateur tiers.

### SDK Rust (`sdk-rust/`)
- Async Tokio, une tâche de fond possède la connexion WebSocket (`tokio-tungstenite`).
- `subscribe()` retourne un `broadcast::Receiver` (plusieurs abonnés par canal).
- `unsubscribe()` explicite (API légèrement différente des autres SDKs : `broadcast::Receiver` n'a pas de hook "dernier abonné parti").

### SDK Python (`sdk-python/`)
- `asyncio`, dépendance unique : `websockets`.
- Callback-based comme le SDK TS (`subscribe(channel_id, handler)`).
- `realtime_sdk.client` est un **import optionnel** : `realtime_sdk.protocol` reste utilisable seul sans `websockets` installé.

### SDK Android/Kotlin (`sdk-android/`)
- Module Gradle `com.android.library`, transport **OkHttp WebSocket**.
- Écrit en Kotlin mais pensé Java-first : `fun interface` (SAM) pour les listeners, `@JvmOverloads` sur la config, aucune coroutine dans l'API publique (planification via `ScheduledExecutorService`).
- Exemples fournis en Kotlin **et** en Java (`examples/`).

---

## 5. Statut de validation — précis, pas juste rassurant

Cet environnement de développement n'avait accès **ni à Internet, ni à un
toolchain Rust, ni à un JDK complet/`kotlinc`**. Seuls Node.js/TypeScript
et Python étaient disponibles avec leurs toolchains.

| Composant | Statut réel |
|---|---|
| `backend/` (Rust) | Écrit, **jamais compilé** — `cargo build` à faire en premier |
| `sdk-typescript/` | ✅ **Compilé et testé** (`tsc --noEmit` + `node --test`, **10/10** tests) |
| `sdk-rust/` | Écrit, **jamais compilé** |
| `sdk-python/protocol.py` | ✅ **Testé** (`unittest`, **13/13**, stdlib pur) |
| `sdk-python/client.py` | Écrit, syntaxe vérifiée (`py_compile`), **non testé au runtime** (dépendance `websockets` non installable) |
| `sdk-android/` | Écrit, **jamais compilé** (ni `kotlinc` ni JDK complet disponibles) |

**Ce qui a réellement été vérifié** : le format binaire (CRC16, offsets, troncature UTF-8 sur frontière de caractère, tous les opcodes y compris UNICAST/UNSUB) est correct dans les deux implémentations qui ont pu tourner (TypeScript et Python) — c'est la partie la plus risquée de tout le projet (une erreur d'un seul octet d'offset casse la compatibilité silencieusement), donc c'est rassurant que les tests y passent des deux côtés indépendamment.

**Ce qui reste à faire avant toute confiance en production** : compiler et faire tourner le backend Rust et les SDKs Rust/Android, puis les faire parler à un vrai serveur.

---

## 6. Limitations connues (documentées dans le code, pas cachées)

| Limitation | Détail |
|---|---|
| REPLAY sur motif | Non supporté — l'historique est indexé par canal exact, pas par motif. Ignoré silencieusement côté serveur. |
| Taille de `user_id` pour UNICAST | Doit tenir dans 24 octets UTF-8 (champ `channel_id` repurposé) — un UUID v4 texte (36 car.) ne rentre pas. |
| Pas d'accusé de réception AUTH | Le protocole n'a pas d'opcode d'ACK explicite ; en cas d'échec, le serveur ferme simplement la connexion. |
| Fallback push en cluster | Décidé sur le nombre d'abonnés *locaux* uniquement (cf. `cluster.rs`) — peut être redondant en multi-instances. |
| `disconnect()` hétérogène entre SDKs | Rust fait un `abort()` direct (pas de handshake WS propre) ; TS/Python/Android envoient un close frame standard. |

---

## 7. Roadmap — état final

**Fait (7 fonctionnalités serveur + 4 SDKs) :**
- [x] Historique & Rattrapage (REPLAY, ring buffer)
- [x] Rate Limiting & Anti-Abus (Token Bucket, session + tenant)
- [x] Admin API (gestion de tenants à chaud)
- [x] Broadcast Multi-Instances (Redis Pub/Sub)
- [x] Wildcard Channels (`orders:*`)
- [x] Métriques Prometheus (`/metrics`)
- [x] Mode Direct User-to-User (UNICAST)
- [x] Désabonnement réseau réel (UNSUB) — ajouté rétroactivement au protocole et aux 4 SDKs
- [x] SDK TypeScript, Rust, Python, Android/Kotlin

**Non fait / hors scope :**
- [ ] Compteur d'abonnés global cross-instances (corrigerait le fallback push redondant en cluster)
- [ ] Publication effective des SDKs sur npm/crates.io/PyPI/Maven

---

## 8. Prochaines étapes suggérées

1. `cd backend && cargo build` — corriger les éventuelles erreurs de compilation.
2. `docker compose up` pour valider le broadcast multi-instances (2 conteneurs + Redis).
3. Brancher le SDK TypeScript (déjà validé côté codec) contre le serveur réel.
4. Compiler/tester les SDKs Rust, Python (installer `websockets`) et Android.
5. Durcir avant prod : secrets via un vrai secret manager, résolution des device tokens FCM, rafraîchissement du jeton OAuth2 FCM.
6. Benchmark de charge (débit, latence) pour valider les contraintes "ultra-performant" du cahier des charges initial.
