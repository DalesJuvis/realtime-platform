//! `client.rs` — Client du moteur temps réel maison.
//!
//! Une tâche Tokio de fond possède la connexion WebSocket et gère seule
//! sa reconnexion (backoff exponentiel + jitter), le heartbeat PING
//! périodique, et le ré-abonnement transparent à tous les canaux actifs
//! après une reconnexion. `RealtimeClient` n'est qu'une poignée légère
//! pour envoyer des commandes à cette tâche et s'abonner à des flux de
//! messages.

use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use uuid::Uuid;

use crate::protocol::{decode_frame, encode_frame, glob_match, DecodedFrame, FrameFields, Opcode};

/// Capacité du buffer broadcast par canal. Un abonné trop lent qui prend
/// plus de retard que cette capacité reçoit une erreur `Lagged` sur son
/// prochain `recv()` plutôt que de faire grossir la mémoire indéfiniment
/// — même principe que côté serveur (`state.rs::CHANNEL_CAPACITY`).
const CHANNEL_CAPACITY: usize = 256;

#[derive(Debug, Clone)]
pub struct ClientConfig {
    pub url: String,
    pub tenant_id: Uuid,
    /// Jeton émis côté serveur (`auth.rs::AuthManager::issue_token`).
    pub token: String,
    pub heartbeat_interval: Duration,
    pub reconnect: bool,
    pub reconnect_base_delay: Duration,
    pub reconnect_max_delay: Duration,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            tenant_id: Uuid::nil(),
            token: String::new(),
            heartbeat_interval: Duration::from_secs(15),
            reconnect: true,
            reconnect_base_delay: Duration::from_millis(500),
            reconnect_max_delay: Duration::from_secs(15),
        }
    }
}

/// Un message reçu, indépendant du transport (miroir de `RealtimeMessage`
/// côté SDK TypeScript, pour une API cohérente entre les deux SDKs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeMessage {
    pub channel_id: String,
    pub payload: String,
    pub tenant_id: Uuid,
}

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("impossible d'envoyer : la tâche de connexion n'est plus active")]
    NotConnected,
}

type ChannelMap = Arc<DashMap<String, broadcast::Sender<RealtimeMessage>>>;

/// Poignée légère vers la connexion temps réel. `RealtimeClient` possède
/// le `JoinHandle` de la tâche de fond, responsable de `disconnect()`
/// (ou du filet de sécurité `Drop` ci-dessous).
pub struct RealtimeClient {
    config: ClientConfig,
    cmd_tx: mpsc::UnboundedSender<[u8; crate::protocol::FRAME_SIZE]>,
    channels: ChannelMap,
    task: Option<tokio::task::JoinHandle<()>>,
}

impl RealtimeClient {
    /// Démarre la connexion en tâche de fond et retourne immédiatement une
    /// poignée pour interagir avec elle — ne bloque pas jusqu'à ce que la
    /// connexion soit établie (elle peut échouer et retenter plusieurs
    /// fois avant de réussir ; observez les logs `tracing` pour le suivi).
    pub fn connect(config: ClientConfig) -> Self {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        let channels: ChannelMap = Arc::new(DashMap::new());

        let task = tokio::spawn(run_connection(config.clone(), cmd_rx, channels.clone()));

        Self {
            config,
            cmd_tx,
            channels,
            task: Some(task),
        }
    }

    /// Publie `payload` sur `channel_id`.
    pub fn publish(&self, channel_id: &str, payload: &str) -> Result<(), ClientError> {
        self.send_frame(Opcode::Publish, channel_id, payload)
    }

    /// Envoi direct à un utilisateur (`channel_id` du frame repurposé
    /// pour porter l'ID destinataire — cf. doc de `Opcode::Unicast`).
    /// ⚠️ L'ID doit tenir dans 24 octets UTF-8 (contrainte du frame fixe).
    pub fn unicast(&self, user_id: &str, payload: &str) -> Result<(), ClientError> {
        self.send_frame(Opcode::Unicast, user_id, payload)
    }

    /// Demande le rattrapage de l'historique de `channel_id` depuis
    /// `since_unix_secs` (0 = tout l'historique disponible). Les frames de
    /// rattrapage arrivent comme des messages normaux sur le récepteur
    /// retourné par `subscribe()` pour ce même canal. Non supporté sur un
    /// motif (`orders:*`) — le serveur l'ignore silencieusement.
    pub fn replay(&self, channel_id: &str, since_unix_secs: u64) -> Result<(), ClientError> {
        self.send_frame(Opcode::Replay, channel_id, &since_unix_secs.to_string())
    }

    /// S'abonne à un canal exact ou à un motif (`orders:*`). Envoie le SUB
    /// immédiatement si la connexion est active ; dans tous les cas, le
    /// canal est mémorisé et automatiquement re-souscrit après toute
    /// reconnexion (`run_connection`). Plusieurs appels avec le même
    /// `channel_id` partagent le même bus interne : chaque appelant reçoit
    /// tous les messages, indépendamment des autres abonnés. Un `Receiver`
    /// déjà obtenu cesse de recevoir (`RecvError::Closed` sur son prochain
    /// `recv()`) dès qu'`unsubscribe()` est appelé pour ce canal, même par
    /// un autre appelant que celui qui a créé ce `Receiver`.
    pub fn subscribe(&self, channel_id: impl Into<String>) -> broadcast::Receiver<RealtimeMessage> {
        let channel_id = channel_id.into();
        let sender = self
            .channels
            .entry(channel_id.clone())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone();

        if let Err(err) = self.send_frame(Opcode::Subscribe, &channel_id, "") {
            // Pas de connexion active pour l'instant : ce n'est pas fatal,
            // le SUB sera envoyé au prochain (re)connect via le
            // ré-abonnement automatique de `run_connection`. Logué en
            // `debug`, pas `warn` : c'est un cas attendu (SUB appelé avant
            // que `connect()` ait fini d'établir le socket).
            tracing::debug!(%channel_id, error = %err, "SUB différé (connexion pas encore établie)");
        }

        sender.subscribe()
    }

    /// Ferme la connexion et arrête la tâche de fond. Pas de handshake de
    /// fermeture WebSocket propre envoyé au serveur ici (juste
    /// `JoinHandle::abort()`) : simplification assumée — un `close()`
    /// gracieux nécessiterait un état supplémentaire dans `run_connection`
    /// pour distinguer "coupure réseau à retenter" de "fermeture demandée
    /// par l'appelant", non implémenté dans cette première version.
    pub fn disconnect(mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }

    /// Se désabonne complètement de `channel_id` : retire le bus local
    /// (tout `Receiver` déjà obtenu via `subscribe()` pour ce canal cessera
    /// de recevoir de nouveaux messages) et envoie un vrai frame UNSUB au
    /// serveur (Opcode `0x09`) pour que la tâche de relais côté serveur
    /// soit réellement arrêtée — pas un simple silence côté client.
    ///
    /// Contrairement au SDK TypeScript (désabonnement par handler, avec
    /// retrait automatique une fois le dernier handler retiré), ce SDK
    /// expose `unsubscribe()` explicitement : `broadcast::Receiver` n'a
    /// pas de hook natif pour détecter "plus aucun abonné actif", donc
    /// c'est à l'appelant de le signaler.
    pub fn unsubscribe(&self, channel_id: &str) -> Result<(), ClientError> {
        self.channels.remove(channel_id);
        self.send_frame(Opcode::Unsub, channel_id, "")
    }

    fn send_frame(&self, opcode: Opcode, channel_id: &str, payload: &str) -> Result<(), ClientError> {
        let raw = encode_frame(
            FrameFields::new(opcode, self.config.tenant_id)
                .channel_id(channel_id)
                .payload(payload),
        );
        self.cmd_tx.send(raw).map_err(|_| ClientError::NotConnected)
    }
}

impl Drop for RealtimeClient {
    fn drop(&mut self) {
        // Filet de sécurité si `disconnect()` n'a pas été appelé
        // explicitement : évite de laisser la tâche de fond (et sa boucle
        // de reconnexion potentiellement infinie) orpheline.
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

/// Boucle de connexion/reconnexion, exécutée dans une tâche Tokio dédiée
/// pour toute la durée de vie du `RealtimeClient`.
async fn run_connection(
    config: ClientConfig,
    mut cmd_rx: mpsc::UnboundedReceiver<[u8; crate::protocol::FRAME_SIZE]>,
    channels: ChannelMap,
) {
    let mut backoff = config.reconnect_base_delay;

    loop {
        match tokio_tungstenite::connect_async(&config.url).await {
            Ok((ws_stream, _response)) => {
                tracing::info!(url = %config.url, "connecté");
                backoff = config.reconnect_base_delay; // reset après un succès

                match handle_connection(&config, ws_stream, &mut cmd_rx, &channels).await {
                    Ok(ConnectionExit::CommandChannelClosed) => {
                        // Le `RealtimeClient` a été droppé : plus personne
                        // n'enverra de commandes, inutile de continuer.
                        return;
                    }
                    Ok(ConnectionExit::ConnectionLost) => {
                        tracing::warn!("connexion perdue, tentative de reconnexion");
                    }
                    Err(err) => {
                        tracing::warn!(error = %err, "erreur sur la connexion active");
                    }
                }
            }
            Err(err) => {
                tracing::warn!(error = %err, url = %config.url, "échec de connexion");
            }
        }

        if !config.reconnect {
            return;
        }

        // Jitter ±20%, même principe que le SDK TypeScript : évite un
        // effet troupeau si de nombreux clients se reconnectent en même
        // temps après une coupure côté infrastructure serveur.
        let jitter_factor = 0.8 + rand::random::<f64>() * 0.4;
        let delay = backoff.mul_f64(jitter_factor);
        tokio::time::sleep(delay).await;
        backoff = std::cmp::min(backoff * 2, config.reconnect_max_delay);
    }
}

enum ConnectionExit {
    /// Le `RealtimeClient` a été droppé (plus d'émetteur de commandes).
    CommandChannelClosed,
    /// Le socket s'est fermé ou a renvoyé une erreur réseau : à retenter.
    ConnectionLost,
}

async fn handle_connection(
    config: &ClientConfig,
    ws_stream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    cmd_rx: &mut mpsc::UnboundedReceiver<[u8; crate::protocol::FRAME_SIZE]>,
    channels: &ChannelMap,
) -> Result<ConnectionExit, tokio_tungstenite::tungstenite::Error> {
    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    // AUTH systématiquement en premier.
    let auth = encode_frame(FrameFields::new(Opcode::Auth, config.tenant_id).payload(&config.token));
    ws_tx.send(WsMessage::Binary(auth.to_vec())).await?;

    // Re-souscrit à tous les canaux déjà enregistrés — essentiel pour
    // qu'une reconnexion soit transparente pour l'appelant : il n'a pas à
    // ré-appeler `subscribe()` lui-même après une coupure réseau.
    for entry in channels.iter() {
        let sub =
            encode_frame(FrameFields::new(Opcode::Subscribe, config.tenant_id).channel_id(entry.key().clone()));
        ws_tx.send(WsMessage::Binary(sub.to_vec())).await?;
    }

    let mut heartbeat = tokio::time::interval(config.heartbeat_interval);
    heartbeat.tick().await; // ignore le tick immédiat initial

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                let ping = encode_frame(FrameFields::new(Opcode::Ping, config.tenant_id));
                ws_tx.send(WsMessage::Binary(ping.to_vec())).await?;
            }

            outgoing = cmd_rx.recv() => {
                match outgoing {
                    Some(raw) => { ws_tx.send(WsMessage::Binary(raw.to_vec())).await?; }
                    None => return Ok(ConnectionExit::CommandChannelClosed),
                }
            }

            incoming = ws_rx.next() => {
                match incoming {
                    Some(Ok(WsMessage::Binary(bytes))) => {
                        match decode_frame(&bytes) {
                            Ok(frame) => dispatch(channels, frame),
                            Err(err) => tracing::debug!(error = %err, "frame invalide reçu, ignoré"),
                        }
                    }
                    Some(Ok(WsMessage::Close(_))) | None => return Ok(ConnectionExit::ConnectionLost),
                    Some(Ok(_)) => {} // Ping/Pong/Text WS ignorés : protocole 100% binaire 256o
                    Some(Err(err)) => return Err(err),
                }
            }
        }
    }
}

/// Route un frame décodé vers les abonnés locaux : correspondance exacte
/// d'abord, puis motifs actifs (`orders:*`) qui matchent le canal réel.
fn dispatch(channels: &ChannelMap, frame: DecodedFrame) {
    let message = RealtimeMessage {
        channel_id: frame.channel_id.clone(),
        payload: frame.payload,
        tenant_id: frame.tenant_id,
    };

    if let Some(sender) = channels.get(&frame.channel_id) {
        let _ = sender.send(message.clone());
    }

    for entry in channels.iter() {
        if entry.key().contains('*') && glob_match(entry.key(), &frame.channel_id) {
            let _ = entry.value().send(message.clone());
        }
    }
}
