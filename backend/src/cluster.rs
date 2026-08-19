//! `cluster.rs` — Broadcast inter-instances via Redis Pub/Sub (roadmap
//! "Broadcast Multi-Instances / Horizontal Scaling").
//!
//! Permet à N instances du moteur, derrière un load balancer, de se
//! comporter comme un seul bus logique : un message publié sur
//! l'instance A doit atteindre un abonné connecté sur l'instance B.
//!
//! ## Design
//! Chaque instance publie sur un unique canal Redis (`rt:cluster`) une
//! enveloppe `{origin_instance_id (16o), frame brut (256o)}`. Chaque
//! instance est également abonnée à ce même canal ; à réception, si
//! `origin != self`, le frame est réinjecté dans le routeur **local**
//! pour fan-out vers les sockets connectés sur cette instance.
//!
//! La délivrance aux abonnés de l'instance d'origine reste directe via
//! `MultiTenantRouter::publish()` (appelée par `main.rs` avant
//! `ClusterBus::broadcast()`) — Redis ne sert qu'au fan-out **inter**-
//! instances, jamais au chemin local, pour ne pas payer un aller-retour
//! réseau sur la latence des abonnés co-localisés avec le publisher.
//!
//! ## Limite connue (documentée volontairement plutôt que masquée)
//! Le fallback push FCM (`push.rs`) se décide dans `main.rs` à partir du
//! nombre d'abonnés **locaux** retourné par `router.publish()`. En
//! déploiement multi-instances, une instance sans abonné local peut donc
//! déclencher un push FCM redondant alors qu'une autre instance du
//! cluster a bien un abonné actif. Piste de correction : maintenir un
//! compteur d'abonnés global par canal dans Redis (`INCR`/`DECR` sur
//! SUB/déconnexion) et ne déclencher le fallback que si ce compteur
//! global est à zéro — non implémenté ici pour garder ce module centré
//! sur le seul transport du fan-out.

use std::sync::Arc;

use futures_util::StreamExt;
use redis::AsyncCommands;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::protocol::{Frame, FRAME_SIZE};
use crate::state::{AppState, ChannelKey};

const CLUSTER_CHANNEL: &str = "rt:cluster";
const ORIGIN_LEN: usize = 16;
const ENVELOPE_LEN: usize = ORIGIN_LEN + FRAME_SIZE;
const OUTBOUND_QUEUE_CAPACITY: usize = 4096;

/// Encode une enveloppe `{origin, frame}` pour publication Redis.
fn encode_envelope(origin: Uuid, frame: &[u8; FRAME_SIZE]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(ENVELOPE_LEN);
    buf.extend_from_slice(origin.as_bytes());
    buf.extend_from_slice(frame);
    buf
}

/// Décode une enveloppe reçue de Redis. Retourne `None` si la taille ne
/// correspond pas (message d'un autre producteur sur le même canal,
/// version de protocole incompatible, corruption, etc.) plutôt que de
/// paniquer sur un flux externe non maîtrisé.
fn decode_envelope(bytes: &[u8]) -> Option<(Uuid, [u8; FRAME_SIZE])> {
    if bytes.len() != ENVELOPE_LEN {
        return None;
    }
    let origin = Uuid::from_slice(&bytes[0..ORIGIN_LEN]).ok()?;
    let mut frame = [0u8; FRAME_SIZE];
    frame.copy_from_slice(&bytes[ORIGIN_LEN..]);
    Some((origin, frame))
}

/// Handle de bus inter-instances, détenu par `ServerContext` (optionnel :
/// une instance seule, sans `REDIS_URL` configuré, tourne parfaitement
/// sans ce module — c'est un mode de déploiement à part entière, pas
/// juste un fallback dégradé).
pub struct ClusterBus {
    instance_id: Uuid,
    tx: mpsc::Sender<[u8; FRAME_SIZE]>,
}

impl ClusterBus {
    /// Se connecte à Redis et démarre les deux tâches de fond :
    /// - une tâche consommatrice qui `PUBLISH` les frames locaux sortants ;
    /// - une tâche abonnée (`SUBSCRIBE`) qui réinjecte les frames émis par
    ///   les *autres* instances dans le routeur local.
    ///
    /// Note d'implémentation : l'API exacte de `redis-rs` pour le pub/sub
    /// asynchrone (noms de méthodes `get_async_pubsub`/`on_message`) varie
    /// entre versions majeures de la crate — à valider avec la version
    /// épinglée dans `Cargo.toml` lors du premier `cargo build` (ce
    /// module n'a pas pu être compilé dans cet environnement, sans accès
    /// réseau pour résoudre les crates externes).
    pub async fn connect(
        redis_url: &str,
        state: Arc<AppState>,
    ) -> Result<Arc<Self>, redis::RedisError> {
        let instance_id = Uuid::new_v4();
        let client = redis::Client::open(redis_url)?;

        // Connexion dédiée à la publication (multiplexée, sûre pour un
        // usage concurrent depuis une seule tâche consommatrice).
        let mut pub_conn = client.get_multiplexed_async_connection().await?;
        let (tx, mut rx) = mpsc::channel::<[u8; FRAME_SIZE]>(OUTBOUND_QUEUE_CAPACITY);

        tokio::spawn(async move {
            while let Some(frame) = rx.recv().await {
                let envelope = encode_envelope(instance_id, &frame);
                if let Err(err) = pub_conn
                    .publish::<_, _, ()>(CLUSTER_CHANNEL, envelope)
                    .await
                {
                    tracing::warn!(error = %err, "échec PUBLISH Redis (cluster bus)");
                }
            }
        });

        // Connexion dédiée à l'abonnement : une connexion PubSub Redis ne
        // sert plus qu'à ça une fois en mode souscription, elle doit donc
        // être distincte de la connexion de publication ci-dessus.
        let mut sub_conn = client.get_async_pubsub().await?;
        sub_conn.subscribe(CLUSTER_CHANNEL).await?;

        tokio::spawn(async move {
            let mut stream = sub_conn.on_message();
            while let Some(msg) = stream.next().await {
                let payload: Vec<u8> = match msg.get_payload() {
                    Ok(p) => p,
                    Err(err) => {
                        tracing::warn!(error = %err, "payload Redis illisible (cluster bus)");
                        continue;
                    }
                };

                let Some((origin, raw)) = decode_envelope(&payload) else {
                    continue;
                };
                if origin == instance_id {
                    continue; // déjà délivré localement au moment de la publication d'origine
                }

                let frame = match Frame::parse(&raw) {
                    Ok(f) => f,
                    Err(err) => {
                        tracing::debug!(error = %err, "frame invalide reçu du cluster bus, ignoré");
                        continue;
                    }
                };

                let key = ChannelKey::new(frame.tenant_id(), frame.channel_id());
                // Republication strictement locale : `MultiTenantRouter`
                // n'a aucune notion de cluster, elle ne fait que du
                // fan-out `broadcast::Sender` + historique — pas de
                // risque de boucle infinie vers Redis depuis ce chemin.
                let _ = state.router.publish(frame.tenant_id(), &key, raw);
            }
        });

        Ok(Arc::new(Self { instance_id, tx }))
    }

    /// Diffuse un frame déjà délivré localement vers les autres instances
    /// du cluster. Non bloquant : si la file est pleine, le frame est
    /// abandonné pour le fan-out inter-instances plutôt que de ralentir
    /// le chemin de publication local — même principe que `push.rs`.
    pub fn broadcast(&self, frame: [u8; FRAME_SIZE]) {
        if self.tx.try_send(frame).is_err() {
            tracing::warn!(
                "file du cluster bus saturée, frame abandonné pour le fan-out inter-instances"
            );
        }
    }

    pub fn instance_id(&self) -> Uuid {
        self.instance_id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_roundtrip() {
        let origin = Uuid::from_u128(42);
        let frame = crate::protocol::FrameBuilder::new(
            crate::protocol::Opcode::Message,
            Uuid::from_u128(1),
        )
        .channel_id("room-1")
        .payload("hello cluster")
        .build();

        let encoded = encode_envelope(origin, &frame);
        assert_eq!(encoded.len(), ENVELOPE_LEN);

        let (decoded_origin, decoded_frame) = decode_envelope(&encoded).unwrap();
        assert_eq!(decoded_origin, origin);
        assert_eq!(decoded_frame, frame);
    }

    #[test]
    fn decode_rejects_wrong_length() {
        assert!(decode_envelope(&[0u8; 10]).is_none());
        assert!(decode_envelope(&[0u8; ENVELOPE_LEN + 1]).is_none());
    }
}
