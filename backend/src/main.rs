//! `main.rs` — Point d'entrée : serveur WebSocket (Axum) + serveur TCP
//! brut, partageant le même `AppState`, avec arrêt propre sur
//! SIGINT/SIGTERM (contrainte #5, pour un conteneur Docker bien élevé).

mod admin;
mod auth;
mod cluster;
mod metrics;
mod presence;
mod protocol;
mod push;
mod rate_limit;
mod state;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use uuid::Uuid;

use admin::{admin_router, AdminContext};
use auth::AuthManager;
use cluster::ClusterBus;
use metrics::{Metrics, Transport};
use protocol::{Frame, FrameBuilder, Opcode, FRAME_SIZE};
use push::{FcmConfig, PushDispatcher};
use rate_limit::{RateLimitConfig, RateLimiter};
use state::{AppState, ChannelKey, SessionId, TenantId};

const PRESENCE_TIMEOUT: Duration = Duration::from_secs(30);
const PRESENCE_SWEEP_INTERVAL: Duration = Duration::from_secs(5);
const WS_BIND_ADDR: &str = "0.0.0.0:8080";
const TCP_BIND_ADDR: &str = "0.0.0.0:7878";
const ADMIN_BIND_ADDR: &str = "0.0.0.0:9090";
const RELAY_BUFFER: usize = 256;

/// Contexte global injecté dans tous les handlers réseau : état
/// applicatif, gestionnaire d'auth et dispatcher push, regroupés pour ne
/// propager qu'un seul `Clone` bon marché (tout est déjà `Arc` en interne).
#[derive(Clone)]
struct ServerContext {
    state: Arc<AppState>,
    auth: Arc<AuthManager>,
    push: Arc<PushDispatcher>,
    rate_limiter: Arc<RateLimiter>,
    /// `None` en déploiement single-instance (pas de `REDIS_URL` fourni) :
    /// le service fonctionne alors exactement comme avant, sans dépendance
    /// Redis. `Some` active le fan-out inter-instances (roadmap "Broadcast
    /// Multi-Instances").
    cluster: Option<Arc<ClusterBus>>,
    metrics: Arc<Metrics>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app_state = AppState::new(PRESENCE_TIMEOUT);
    let auth = Arc::new(AuthManager::new());

    // TODO production : charger les secrets de tenants depuis une source
    // externe (base de données, secret manager, fichier monté en volume
    // Docker) plutôt que ce tenant de démonstration piloté par env var.
    if let Ok(secret) = std::env::var("DEMO_TENANT_SECRET") {
        auth.register_tenant(Uuid::from_u128(1), secret.into_bytes());
    }

    let push = PushDispatcher::spawn(FcmConfig {
        project_id: std::env::var("FCM_PROJECT_ID").unwrap_or_default(),
        bearer_token: std::env::var("FCM_BEARER_TOKEN").unwrap_or_default(),
    });

    let rate_limiter = Arc::new(RateLimiter::new(RateLimitConfig::default()));
    let metrics = Metrics::new();

    // Broadcast multi-instances (roadmap "Horizontal Scaling") : optionnel,
    // activé uniquement si REDIS_URL est fourni. Sans lui, le service
    // tourne en mode single-instance classique, identique au comportement
    // précédent.
    let cluster = match std::env::var("REDIS_URL") {
        Ok(url) => match ClusterBus::connect(&url, app_state.clone()).await {
            Ok(bus) => {
                tracing::info!(instance_id = %bus.instance_id(), %url, "connecté au cluster bus Redis");
                Some(bus)
            }
            Err(err) => {
                tracing::error!(error = %err, %url, "connexion au cluster bus Redis échouée, démarrage en mode single-instance");
                None
            }
        },
        Err(_) => {
            tracing::info!("REDIS_URL non défini : mode single-instance (pas de broadcast inter-instances)");
            None
        }
    };

    let ctx = ServerContext {
        state: app_state.clone(),
        auth: auth.clone(),
        push,
        rate_limiter: rate_limiter.clone(),
        cluster,
        metrics: metrics.clone(),
    };

    // Jeton d'admin : à fournir en production via ADMIN_API_TOKEN (secret
    // manager / variable d'environnement injectée par l'orchestrateur). À
    // défaut, on en génère un aléatoire et on le logue une seule fois au
    // démarrage — pratique en dev, à ne jamais laisser en l'état en prod
    // (le jeton ne survivrait de toute façon pas à un redémarrage).
    let admin_token = std::env::var("ADMIN_API_TOKEN").unwrap_or_else(|_| {
        let generated = Uuid::new_v4().to_string();
        tracing::warn!(
            token = %generated,
            "ADMIN_API_TOKEN non défini : jeton admin temporaire généré (à fixer en production)"
        );
        generated
    });
    let admin_ctx = AdminContext {
        auth,
        rate_limiter,
        admin_token: Arc::new(admin_token),
        metrics,
    };
    let admin_listener = TcpListener::bind(ADMIN_BIND_ADDR)
        .await
        .unwrap_or_else(|e| panic!("bind Admin API sur {ADMIN_BIND_ADDR} impossible : {e}"));
    tracing::info!(
        "Admin API à l'écoute sur {ADMIN_BIND_ADDR} (réseau interne uniquement, ne pas exposer publiquement)"
    );
    let admin_server = tokio::spawn(async move {
        axum::serve(admin_listener, admin_router(admin_ctx))
            .with_graceful_shutdown(shutdown_signal())
            .await
            .expect("erreur fatale Admin API");
    });

    // Boucle heartbeat/présence en tâche de fond (contrainte #3).
    let sweeper = presence::spawn_heartbeat_loop(app_state.clone(), PRESENCE_SWEEP_INTERVAL);

    let ws_app = Router::new()
        .route("/ws", get(ws_upgrade_handler))
        .with_state(ctx.clone());
    let ws_listener = TcpListener::bind(WS_BIND_ADDR)
        .await
        .unwrap_or_else(|e| panic!("bind WebSocket sur {WS_BIND_ADDR} impossible : {e}"));
    tracing::info!("serveur WebSocket à l'écoute sur {WS_BIND_ADDR}");
    let ws_server = tokio::spawn(async move {
        axum::serve(ws_listener, ws_app)
            .with_graceful_shutdown(shutdown_signal())
            .await
            .expect("erreur fatale serveur WebSocket");
    });

    let tcp_listener = TcpListener::bind(TCP_BIND_ADDR)
        .await
        .unwrap_or_else(|e| panic!("bind TCP sur {TCP_BIND_ADDR} impossible : {e}"));
    tracing::info!("serveur TCP à l'écoute sur {TCP_BIND_ADDR}");
    let tcp_ctx = ctx.clone();
    let tcp_server = tokio::spawn(async move {
        loop {
            tokio::select! {
                accepted = tcp_listener.accept() => {
                    match accepted {
                        Ok((socket, addr)) => {
                            let ctx = tcp_ctx.clone();
                            tokio::spawn(async move {
                                if let Err(err) = handle_tcp_connection(socket, ctx).await {
                                    tracing::debug!(%addr, error = %err, "connexion TCP close en erreur");
                                }
                            });
                        }
                        Err(err) => tracing::warn!(error = %err, "échec d'acceptation TCP"),
                    }
                }
                _ = shutdown_signal() => break,
            }
        }
    });

    let _ = tokio::join!(ws_server, tcp_server, admin_server);
    sweeper.abort();
    tracing::info!("arrêt complet");
}

/// Attend SIGINT (Ctrl+C, local) ou SIGTERM (arrêt envoyé par Docker/
/// Kubernetes) pour déclencher un shutdown propre plutôt qu'un kill brutal
/// des connexions actives.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("échec d'installation du handler Ctrl+C");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("échec d'installation du handler SIGTERM")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
    tracing::info!("signal d'arrêt reçu, fermeture propre en cours");
}

/// Résultat du traitement d'une commande entrante (frame), partagé entre
/// les chemins WebSocket et TCP pour éviter de dupliquer la logique
/// métier — seul le transport (WS vs TCP brut) diffère entre les deux.
enum Command {
    /// Une souscription a été acceptée : `key` (canal exact ou motif) sert
    /// à indexer la tâche de relais chez l'appelant, pour pouvoir
    /// l'`abort()` précisément sur un futur UNSUB — sans elle, un UNSUB ne
    /// pourrait pas savoir quelle tâche de relais arrêter parmi plusieurs.
    Subscribed(String, tokio::sync::broadcast::Receiver<[u8; FRAME_SIZE]>),
    /// Désabonnement d'un canal ou motif précis (Opcode UNSUB) : l'appelant
    /// doit `abort()` puis retirer la tâche de relais associée à cette clé.
    Unsubscribed(String),
    /// Réponse à un Opcode REPLAY : les frames historiques à renvoyer
    /// immédiatement sur le socket, dans l'ordre chronologique.
    Replayed(Vec<[u8; FRAME_SIZE]>),
    /// Rien à faire côté transport (commande traitée en interne : AUTH,
    /// PING, PUB, ou frame ignorée/rejetée).
    None,
    /// La connexion doit être fermée (AUTH invalide, close explicite).
    Close,
}

/// Nom de canal interne conventionnel pour la boîte privée d'un
/// utilisateur (roadmap "Direct User-to-User"). Préfixe `user:` réservé :
/// un tenant qui publierait explicitement sur un canal `user:xxx` via PUB
/// atteindrait donc aussi les UNICAST adressés à `xxx` — comportement
/// volontaire (un seul espace de canaux sous-jacent), pas un bug, mais à
/// documenter côté client si ça n'est pas le comportement désiré pour un
/// tenant donné.
fn unicast_inbox_channel(user_id: &str) -> String {
    format!("user:{user_id}")
}

/// Logique commune à `PUB` et `UNICAST` : publie le frame sur `key`
/// (canal explicite pour PUB, boîte privée résolue pour UNICAST),
/// diffuse vers les autres instances du cluster, et bascule vers le
/// fallback push si personne n'est branché localement. Partagée pour ne
/// pas dupliquer cette logique (et le risque de désynchronisation entre
/// les deux chemins) à chaque évolution de l'un des deux opcodes.
fn publish_and_fanout(
    ctx: &ServerContext,
    session_id: SessionId,
    tenant_id: TenantId,
    key: &ChannelKey,
    frame: &Frame<'_>,
) -> Command {
    let raw = *frame.as_bytes();
    match ctx.state.router.publish(tenant_id, key, raw) {
        Ok(local_subscribers) => {
            // Fan-out vers les autres instances du cluster, que cette
            // instance ait ou non des abonnés locaux : une autre instance
            // peut très bien en avoir. Cf. la note de limitation dans
            // `cluster.rs` sur l'interaction avec le fallback push ci-dessous.
            if let Some(cluster) = &ctx.cluster {
                cluster.broadcast(raw);
            }

            if local_subscribers == 0 {
                // Aucun abonné socket actif *localement* : fallback push
                // (contrainte #4). La résolution des device tokens
                // (tenant/canal -> jetons FCM) est un détail applicatif à
                // brancher ici (DB/cache).
                let job = push::build_push_job(
                    tenant_id,
                    &key.channel_id,
                    frame.payload(),
                    Vec::new(),
                );
                ctx.push.submit(job);
                ctx.metrics.record_push_fallback(tenant_id);
            }
            Command::None
        }
        Err(err) => {
            tracing::debug!(%session_id, error = %err, "PUB/UNICAST refusé");
            Command::None
        }
    }
}

/// Libellé court et stable d'un opcode, utilisé comme valeur de label
/// Prometheus (`messages_total{opcode=...}`) — plus lisible dans Grafana
/// que le byte brut.
fn opcode_label(opcode: Opcode) -> &'static str {
    match opcode {
        Opcode::Subscribe => "SUB",
        Opcode::Publish => "PUB",
        Opcode::Message => "MSG",
        Opcode::Auth => "AUTH",
        Opcode::Ping => "PING",
        Opcode::Presence => "PRESENCE",
        Opcode::Replay => "REPLAY",
        Opcode::Unicast => "UNICAST",
        Opcode::Unsub => "UNSUB",
    }
}

/// Traite un frame entrant déjà parsé et authentifié/à authentifier :
/// logique métier commune WS/TCP (auth, heartbeat, sub, pub + fallback push).
///
/// Mesure et enregistre la latence de traitement (hors I/O réseau, qui
/// est gérée par l'appelant) ainsi qu'un compteur de messages par tenant
/// et opcode, pour `/metrics` (roadmap "Dashboard de Monitoring").
fn process_frame(
    ctx: &ServerContext,
    session_id: SessionId,
    authenticated_tenant: &mut Option<TenantId>,
    frame: &Frame<'_>,
) -> Command {
    let started_at = Instant::now();
    let opcode = frame.opcode();

    let command = process_frame_inner(ctx, session_id, authenticated_tenant, frame);

    ctx.metrics
        .record_frame(frame.tenant_id(), opcode_label(opcode), started_at.elapsed());

    command
}

fn process_frame_inner(
    ctx: &ServerContext,
    session_id: SessionId,
    authenticated_tenant: &mut Option<TenantId>,
    frame: &Frame<'_>,
) -> Command {
    match frame.opcode() {
        Opcode::Auth => match ctx.auth.validate(frame.tenant_id(), frame.payload()) {
            Ok(claims) => {
                let tenant_id = frame.tenant_id();
                *authenticated_tenant = Some(tenant_id);
                presence::handle_join(&ctx.state, tenant_id, session_id);

                // Abonnement automatique à la boîte privée de l'utilisateur
                // (roadmap "Direct User-to-User") : dès l'AUTH, la session
                // peut recevoir des UNICAST sans SUB explicite. Pas de
                // suivi de présence pour cette boîte : c'est un canal
                // d'adressage individuel, pas un espace partagé où un
                // JOIN/LEAVE a un sens pour d'autres participants.
                let inbox = ChannelKey::new(tenant_id, unicast_inbox_channel(&claims.sub));
                match ctx.state.router.subscribe(tenant_id, &inbox) {
                    Ok(rx) => Command::Subscribed(inbox.channel_id.clone(), rx),
                    Err(err) => {
                        // Ne devrait jamais arriver (même tenant des deux
                        // côtés) ; si ça arrive quand même, l'utilisateur
                        // reste authentifié mais ne recevra pas d'UNICAST
                        // tant qu'il ne s'abonne pas manuellement.
                        tracing::warn!(%session_id, error = %err, "auto-abonnement inbox UNICAST échoué");
                        Command::None
                    }
                }
            }
            Err(err) => {
                tracing::debug!(%session_id, error = %err, "échec d'authentification");
                Command::Close
            }
        },

        Opcode::Ping => {
            if authenticated_tenant.is_some() {
                ctx.state.presence.heartbeat(session_id);
            }
            Command::None
        }

        Opcode::Subscribe => {
            let Some(tenant_id) = *authenticated_tenant else {
                return Command::None; // pas de SUB avant AUTH
            };
            if tenant_id != frame.tenant_id() {
                return Command::None; // isolation stricte contrainte #2
            }

            let channel_id = frame.channel_id();
            if channel_id.contains('*') {
                // Souscription par motif (roadmap "Channel Multiplexing").
                // Pas de suivi de présence par canal ici : un motif ne
                // désigne aucun canal concret sur lequel publier un
                // évènement JOIN/LEAVE cohérent.
                let rx = ctx.state.router.subscribe_wildcard(tenant_id, channel_id);
                return Command::Subscribed(channel_id.to_string(), rx);
            }

            let key = ChannelKey::new(tenant_id, channel_id);
            match ctx.state.router.subscribe(tenant_id, &key) {
                Ok(rx) => {
                    presence::handle_subscribe(&ctx.state, tenant_id, session_id, channel_id);
                    Command::Subscribed(channel_id.to_string(), rx)
                }
                Err(err) => {
                    tracing::debug!(%session_id, error = %err, "SUB refusé");
                    Command::None
                }
            }
        }

        Opcode::Unsub => {
            let Some(tenant_id) = *authenticated_tenant else {
                return Command::None; // pas d'UNSUB avant AUTH
            };
            if tenant_id != frame.tenant_id() {
                return Command::None; // isolation stricte contrainte #2
            }
            let channel_id = frame.channel_id().to_string();
            // Pas de suivi de présence pour un motif (cf. SUB ci-dessus) :
            // rien à publier dans ce cas, seul le relais est arrêté.
            if !channel_id.contains('*') {
                presence::handle_unsubscribe(&ctx.state, tenant_id, session_id, &channel_id);
            }
            Command::Unsubscribed(channel_id)
        }

        Opcode::Publish => {
            let Some(tenant_id) = *authenticated_tenant else {
                return Command::None;
            };
            if tenant_id != frame.tenant_id() {
                return Command::None;
            }
            let key = ChannelKey::new(tenant_id, frame.channel_id());
            publish_and_fanout(ctx, session_id, tenant_id, &key, frame)
        }

        Opcode::Unicast => {
            let Some(tenant_id) = *authenticated_tenant else {
                return Command::None;
            };
            if tenant_id != frame.tenant_id() {
                return Command::None;
            }
            // `channel_id` est repurposé : il porte l'ID du destinataire,
            // résolu vers sa boîte privée (cf. doc de `Opcode::Unicast`).
            let target_user_id = frame.channel_id();
            let key = ChannelKey::new(tenant_id, unicast_inbox_channel(target_user_id));
            publish_and_fanout(ctx, session_id, tenant_id, &key, frame)
        }

        Opcode::Replay => {
            let Some(tenant_id) = *authenticated_tenant else {
                return Command::None; // pas de REPLAY avant AUTH
            };
            if tenant_id != frame.tenant_id() {
                return Command::None; // isolation stricte contrainte #2
            }
            let channel_id = frame.channel_id();
            if channel_id.contains('*') {
                // L'historique est indexé par canal exact (`ChannelKey`),
                // pas par motif : rejouer un motif demanderait d'agréger
                // l'historique de tous les canaux concrets qui y ont
                // jamais matché, non conservé comme tel. Non supporté
                // pour l'instant plutôt que de renvoyer un résultat
                // partiel silencieusement trompeur.
                tracing::debug!(%session_id, "REPLAY sur motif non supporté, ignoré");
                return Command::None;
            }
            // Payload = timestamp Unix (secondes, ASCII décimal) depuis
            // lequel le client veut être rattrapé. "0" ou payload vide/
            // non numérique => tout l'historique disponible dans le ring
            // buffer du canal.
            let since_secs: u64 = frame.payload().trim().parse().unwrap_or(0);
            let key = ChannelKey::new(tenant_id, frame.channel_id());
            match ctx.state.router.replay(tenant_id, &key, since_secs) {
                Ok(frames) => Command::Replayed(frames),
                Err(err) => {
                    tracing::debug!(%session_id, error = %err, "REPLAY refusé");
                    Command::None
                }
            }
        }

        Opcode::Message | Opcode::Presence => Command::None, // opcodes serveur -> client uniquement
    }
}

// ----------------------------------------------------------------------------
// WebSocket
// ----------------------------------------------------------------------------

async fn ws_upgrade_handler(
    ws: WebSocketUpgrade,
    State(ctx): State<ServerContext>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_connection(socket, ctx))
}

async fn handle_ws_connection(socket: WebSocket, ctx: ServerContext) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let session_id: SessionId = Uuid::new_v4();
    let mut authenticated_tenant: Option<TenantId> = None;
    ctx.metrics.connection_opened(Transport::WebSocket);

    // Agrège les messages de tous les canaux auxquels cette session
    // s'abonne, pour les relayer vers le socket sans bloquer la boucle de
    // lecture des commandes entrantes sur ce même socket.
    let (out_tx, mut out_rx) = mpsc::channel::<[u8; FRAME_SIZE]>(RELAY_BUFFER);
    // Indexée par clé de canal/motif (plutôt qu'un simple Vec) pour qu'un
    // UNSUB puisse cibler et `abort()` précisément la bonne tâche de
    // relais, sans affecter les autres souscriptions actives du socket.
    let mut relay_tasks: HashMap<String, tokio::task::JoinHandle<()>> = HashMap::new();

    loop {
        tokio::select! {
            incoming = ws_rx.next() => {
                let Some(Ok(msg)) = incoming else { break };
                let bytes = match msg {
                    Message::Binary(b) => b,
                    Message::Close(_) => break,
                    _ => continue, // protocole 100% binaire 256o : Text/Ping/Pong ignorés
                };
                let frame = match Frame::parse_slice(&bytes) {
                    Ok(f) => f,
                    Err(err) => {
                        tracing::debug!(%session_id, error = %err, "frame WS invalide ignoré");
                        continue;
                    }
                };

                // Anti-abus (roadmap "Rate Limiting") : vérifié avant tout
                // traitement métier, y compris avant AUTH, pour ne jamais
                // laisser un flood consommer du CPU au-delà du parsing.
                if !ctx.rate_limiter.check(session_id, frame.tenant_id()) {
                    tracing::debug!(%session_id, "frame WS rejeté (rate limit)");
                    ctx.metrics.record_rate_limited(frame.tenant_id());
                    continue;
                }

                match process_frame(&ctx, session_id, &mut authenticated_tenant, &frame) {
                    Command::Subscribed(key, mut rx) => {
                        let out_tx = out_tx.clone();
                        let handle = tokio::spawn(async move {
                            while let Ok(relayed) = rx.recv().await {
                                if out_tx.send(relayed).await.is_err() {
                                    break;
                                }
                            }
                        });
                        // Un re-SUB sur une clé déjà active remplace la
                        // tâche précédente plutôt que d'en accumuler une
                        // deuxième qui relaierait les mêmes messages en double.
                        if let Some(old) = relay_tasks.insert(key, handle) {
                            old.abort();
                        }
                    }
                    Command::Unsubscribed(key) => {
                        if let Some(handle) = relay_tasks.remove(&key) {
                            handle.abort();
                        }
                    }
                    Command::Replayed(frames) => {
                        for f in frames {
                            if out_tx.send(f).await.is_err() {
                                break;
                            }
                        }
                    }
                    Command::Close => break,
                    Command::None => {}
                }
            }

            Some(relayed) = out_rx.recv() => {
                if ws_tx.send(Message::Binary(relayed.to_vec())).await.is_err() {
                    break;
                }
            }
        }
    }

    for (_, task) in relay_tasks {
        task.abort();
    }
    ctx.rate_limiter.drop_session(session_id);
    ctx.metrics.connection_closed(Transport::WebSocket);
    if authenticated_tenant.is_some() {
        presence::handle_leave(&ctx.state, session_id);
    }
}

// ----------------------------------------------------------------------------
// TCP brut (frames 256 octets, sans overhead HTTP/WebSocket)
// ----------------------------------------------------------------------------

async fn handle_tcp_connection(socket: TcpStream, ctx: ServerContext) -> std::io::Result<()> {
    let (mut read_half, mut write_half) = socket.into_split();
    let session_id: SessionId = Uuid::new_v4();
    let mut authenticated_tenant: Option<TenantId> = None;
    ctx.metrics.connection_opened(Transport::Tcp);

    let (out_tx, mut out_rx) = mpsc::channel::<[u8; FRAME_SIZE]>(RELAY_BUFFER);
    let mut relay_tasks: HashMap<String, tokio::task::JoinHandle<()>> = HashMap::new();

    loop {
        let mut buf = [0u8; FRAME_SIZE];
        tokio::select! {
            read_result = read_half.read_exact(&mut buf) => {
                if read_result.is_err() {
                    break; // socket fermé ou frame incomplet
                }
                let frame = match Frame::parse(&buf) {
                    Ok(f) => f,
                    Err(err) => {
                        tracing::debug!(%session_id, error = %err, "frame TCP invalide ignoré");
                        continue;
                    }
                };

                if !ctx.rate_limiter.check(session_id, frame.tenant_id()) {
                    tracing::debug!(%session_id, "frame TCP rejeté (rate limit)");
                    ctx.metrics.record_rate_limited(frame.tenant_id());
                    continue;
                }

                match process_frame(&ctx, session_id, &mut authenticated_tenant, &frame) {
                    Command::Subscribed(key, mut rx) => {
                        let out_tx = out_tx.clone();
                        let handle = tokio::spawn(async move {
                            while let Ok(relayed) = rx.recv().await {
                                if out_tx.send(relayed).await.is_err() {
                                    break;
                                }
                            }
                        });
                        if let Some(old) = relay_tasks.insert(key, handle) {
                            old.abort();
                        }
                    }
                    Command::Unsubscribed(key) => {
                        if let Some(handle) = relay_tasks.remove(&key) {
                            handle.abort();
                        }
                    }
                    Command::Replayed(frames) => {
                        for f in frames {
                            if out_tx.send(f).await.is_err() {
                                break;
                            }
                        }
                    }
                    Command::Close => break,
                    Command::None => {
                        // Répond par un PONG applicatif en écho au PING pour
                        // permettre au client TCP de mesurer sa RTT.
                        if frame.opcode() == Opcode::Ping && authenticated_tenant.is_some() {
                            let pong = FrameBuilder::new(Opcode::Ping, frame.tenant_id()).build();
                            if write_half.write_all(&pong).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            }

            Some(relayed) = out_rx.recv() => {
                if write_half.write_all(&relayed).await.is_err() {
                    break;
                }
            }
        }
    }

    for (_, task) in relay_tasks {
        task.abort();
    }
    ctx.rate_limiter.drop_session(session_id);
    ctx.metrics.connection_closed(Transport::Tcp);
    if authenticated_tenant.is_some() {
        presence::handle_leave(&ctx.state, session_id);
    }

    Ok(())
}
