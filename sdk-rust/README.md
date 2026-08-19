# realtime-sdk (Rust)

Client Rust asynchrone (Tokio) pour le moteur de notification et
messagerie temps réel multi-tenant (protocole binaire fixe 256 octets).
API volontairement proche du [SDK TypeScript](../sdk-typescript) —
mêmes opérations, mêmes limitations documentées — pour une expérience
cohérente entre les deux.

> **Statut** : projet démarré, **non compilé** dans l'environnement où il
> a été écrit — aucun toolchain Rust (`cargo`/`rustc`) n'y était
> disponible, contrairement au SDK TypeScript qui a pu être réellement
> compilé et testé. Le code suit scrupuleusement les mêmes structures et
> conventions que `protocol.rs`/`client.rs` côté serveur (déjà écrits
> dans les mêmes contraintes), mais **`cargo build` reste à faire chez
> vous avant tout usage réel** — considérez ceci comme un premier jet
> sérieux, pas un artefact validé.

## Installation

```toml
# Cargo.toml
[dependencies]
realtime-sdk = { path = "../sdk-rust" } # ou en dépendance git/crates.io une fois publié
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
```

## Démarrage rapide

```rust
use realtime_sdk::{ClientConfig, RealtimeClient};
use uuid::Uuid;

#[tokio::main]
async fn main() {
    let client = RealtimeClient::connect(ClientConfig {
        url: "wss://realtime.example.com/ws".to_string(),
        tenant_id: Uuid::parse_str("...").unwrap(),
        token: mon_jeton_emis_par_le_serveur,
        ..Default::default()
    });

    let mut rx = client.subscribe("orders:42");
    tokio::spawn(async move {
        while let Ok(message) = rx.recv().await {
            println!("{}: {}", message.channel_id, message.payload);
        }
    });

    client.publish("orders:42", "commande créée").unwrap();

    // ...
    client.disconnect();
}
```

Voir `examples/basic_usage.rs` pour un exemple complet, y compris
souscription par motif (`orders:*`) et UNICAST.

## Fonctionnalités

| Fonctionnalité | API |
|---|---|
| Publication | `client.publish(channel_id, payload)` |
| Souscription (canal exact ou motif `orders:*`) | `client.subscribe(channel_id) -> broadcast::Receiver<RealtimeMessage>` |
| Désabonnement | `client.unsubscribe(channel_id)` |
| Envoi direct à un utilisateur | `client.unicast(user_id, payload)` |
| Rattrapage d'historique | `client.replay(channel_id, since_unix_secs)` |

Reconnexion automatique (backoff exponentiel + jitter), heartbeat PING
périodique, et ré-abonnement transparent à tous les canaux actifs après
une reconnexion — gérés en tâche de fond, rien à orchestrer manuellement.

`subscribe()` retourne un `tokio::sync::broadcast::Receiver` : plusieurs
appels sur le même `channel_id` partagent le même bus, chaque appelant
reçoit indépendamment tous les messages (y compris ceux publiés pendant
qu'un autre récepteur les traite).

## Limitations connues (documentées, pas cachées)

- **`replay()` ne fonctionne pas sur un motif** (`orders:*`) — l'historique
  serveur est indexé par canal exact, la demande est ignorée
  silencieusement (log côté serveur uniquement).
- **`unicast()` exige un `user_id` ≤ 24 octets UTF-8** (contrainte du
  frame fixe, champ `channel_id` repurposé).
- **Pas d'accusé de réception AUTH** ni d'évènement `authenticated`
  explicite (contrairement au SDK TypeScript, qui l'émet de façon
  optimiste). Pas non plus, pour l'instant, de canal d'évènements de
  connexion (`open`/`close`/`error`) exposé à l'appelant — seuls des logs
  `tracing`. Amélioration naturelle pour une v2 : exposer un
  `broadcast::Receiver<ConnectionEvent>` symétrique aux souscriptions de
  canaux.
- **`disconnect()` n'envoie pas de frame de fermeture WebSocket propre** —
  simplification assumée (`JoinHandle::abort()` direct), documentée dans
  le code de `RealtimeClient::disconnect`.

*Résolu depuis la v0.1 : `unsubscribe()` envoie désormais un vrai frame
UNSUB (`Opcode 0x09`) au serveur — la tâche de relais côté serveur est
réellement arrêtée, pas juste un silence côté client.*

## Développement

```bash
cargo build
cargo test    # tests du codec binaire (protocol.rs), sans dépendance réseau
cargo run --example basic_usage
```
