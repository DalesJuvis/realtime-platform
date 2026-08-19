# realtime-sdk-android

Client Kotlin/Java (Android + JVM) pour le moteur de notification et
messagerie temps réel multi-tenant (protocole binaire fixe 256 octets).
API volontairement proche des SDKs [TypeScript](../sdk-typescript),
[Rust](../sdk-rust) et [Python](../sdk-python) du même projet — mêmes
opérations, mêmes limitations documentées.

> **Statut de validation (précis, pas juste rassurant) :** ce module n'a
> **pas** pu être compilé dans l'environnement où il a été écrit — ni
> `kotlinc` ni un JDK complet (`javac`) n'y étaient disponibles, seul un
> JRE. La logique du codec (`Protocol.kt`) est une transposition directe
> du SDK Python, lui réellement testé (13/13). Considérez ceci comme un
> premier jet sérieux suivant scrupuleusement les mêmes conventions que
> les trois autres SDKs — **`./gradlew build test` reste à faire chez
> vous** avant tout usage réel, notamment pour vérifier les versions
> exactes du plugin Android Gradle / Kotlin / OkHttp contre votre projet.

## Pourquoi Kotlin plutôt que Java à l'écriture, mais utilisable des deux

Le SDK est écrit en Kotlin (idiomatique pour Android aujourd'hui) mais
conçu dès le départ pour un interop Java propre :

- Les souscriptions utilisent des `fun interface` (SAM) — `MessageListener`
  et `ConnectionListener` — utilisables comme lambda aussi bien en Kotlin
  qu'en Java 8+.
- `RealtimeClientConfig` et les fonctions à paramètres par défaut portent
  `@JvmOverloads`, pour que Java voie de vraies surcharges plutôt qu'un
  seul constructeur/une seule méthode exigeant tous les arguments.
- Aucune coroutine Kotlin dans l'API publique (choix volontaire — cf.
  doc de tête de `RealtimeClient.kt`) : la planification interne repose
  sur un simple `ScheduledExecutorService`, donc rien d'inutilisable
  depuis Java.

Voir `examples/KotlinUsage.kt` et `examples/JavaUsage.java` — même
fonctionnalité, deux langages.

## Installation

Ce dossier est un module Gradle Android autonome (`com.android.library`).
Pour l'intégrer à votre projet : soit en tant que module local
(`settings.gradle.kts` de votre projet : `include(":realtimesdk")` avec
un lien vers ce dossier), soit publié sur un registre Maven interne une
fois prêt.

Dépendance runtime unique : [OkHttp](https://square.github.io/okhttp/)
4.12+, déjà quasi omniprésent dans l'écosystème Android — pas de nouvelle
dépendance réseau à justifier auprès de votre équipe.

## Démarrage rapide (Kotlin)

```kotlin
val client = RealtimeClient(
    RealtimeClientConfig(
        url = "wss://realtime.example.com/ws",
        tenantId = UUID.fromString("..."),
        token = monJetonEmisParLeServeur,
    )
)

val subscription = client.subscribe("orders:42") { message ->
    println(message.payload)
}

client.connect()
client.publish("orders:42", "commande créée")

// Plus tard :
subscription.close() // désabonnement propre, envoie UNSUB au serveur
client.disconnect()
```

## Démarrage rapide (Java)

```java
RealtimeClientConfig config = new RealtimeClientConfig(
    "wss://realtime.example.com/ws",
    UUID.fromString("..."),
    monJetonEmisParLeServeur
);
RealtimeClient client = new RealtimeClient(config);

AutoCloseable subscription = client.subscribe("orders:42",
    message -> System.out.println(message.getPayload()));

client.connect();
client.publish("orders:42", "commande créée");
```

## Fonctionnalités

| Fonctionnalité | API |
|---|---|
| Publication | `client.publish(channelId, payload)` |
| Souscription (canal exact ou motif `orders:*`) | `client.subscribe(channelId, listener) -> AutoCloseable` |
| Désabonnement | `subscription.close()` (envoie un vrai UNSUB, `Opcode 0x09`) |
| Envoi direct à un utilisateur | `client.unicast(userId, payload)` |
| Rattrapage d'historique | `client.replay(channelId, sinceUnixSeconds = 0)` |
| Évènements de connexion | `client.onConnectionEvent { event -> ... }` |

Reconnexion automatique (backoff exponentiel + jitter), heartbeat PING
périodique, et ré-abonnement transparent à tous les canaux actifs après
une reconnexion — gérés par un `ScheduledExecutorService` interne dédié,
rien à orchestrer manuellement depuis votre code applicatif (ni thread
UI Android, ni coroutine).

## Considérations spécifiques Android

- **Cycle de vie** : appelez `connect()` dans `onStart()`/`ViewModel.init`
  et `disconnect()` dans `onStop()`/`ViewModel.onCleared()` — ce SDK ne
  s'accroche à aucun `Context` ni `Lifecycle` Android automatiquement,
  volontairement, pour rester utilisable aussi en JVM pur (backend,
  tests, outillage) sans dépendance `androidx`.
- **Thread de callback** : les `MessageListener`/`ConnectionListener` sont
  appelés depuis le thread interne d'OkHttp (pas le thread principal
  Android). Pour toute mise à jour UI, passez explicitement par
  `runOnUiThread`/`Handler(Looper.getMainLooper())`/un `StateFlow`
  applicatif — ce SDK ne fait aucune hypothèse sur votre couche UI.
- **ProGuard/R8** : aucune règle de conservation spécifique attendue —
  le SDK n'utilise ni réflexion ni annotations de sérialisation.
  Vérifiez néanmoins les règles consommateur d'OkHttp lui-même si vous
  activez la minification.

## Limitations connues (documentées, pas cachées)

- **`replay()` ne fonctionne pas sur un motif** (`orders:*`) — l'historique
  serveur est indexé par canal exact, la demande est ignorée
  silencieusement.
- **`unicast()` exige un `userId` ≤ 24 octets UTF-8** (contrainte du
  frame fixe, champ `channelId` repurposé).
- **Pas d'accusé de réception AUTH.** `ConnectionEvent.Authenticated` est
  émis de façon optimiste juste après l'envoi du frame AUTH — en cas
  d'échec, le serveur ferme simplement la connexion (observez plutôt
  `ConnectionEvent.Closed`).
- **`disconnect()` envoie un code de fermeture WebSocket standard (1000)**
  contrairement aux SDKs Rust (`abort()` direct, sans handshake) — léger
  écart d'implémentation entre SDKs à harmoniser si la symétrie stricte
  vous importe.

## Développement

```bash
./gradlew build   # compile le module
./gradlew test    # tests du codec binaire (JUnit4), sans dépendance réseau
```
