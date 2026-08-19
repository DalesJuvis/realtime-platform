//! `state.rs` — État partagé du serveur : routage multi-tenant thread-safe
//! (`MultiTenantRouter`) et moteur de présence (`PresenceEngine`), le tout
//! assemblé dans `AppState`.
//!
//! Choix structurants :
//! - `DashMap` pour un accès concurrent lock-free (sharded) aux canaux et
//!   aux sessions, sans `RwLock<HashMap<..>>` global qui deviendrait un
//!   point de contention sous forte charge multi-tenant.
//! - `tokio::sync::broadcast` par `(TenantId, ChannelId)` : chaque canal a
//!   son propre bus, ce qui garantit nativement l'isolation entre tenants
//!   — un abonné ne peut physiquement recevoir que les frames publiés sur
//!   le canal auquel il s'est abonné.
//! - Aucune donnée n'est jamais indexée par un tuple qui mélangerait deux
//!   tenants : la clé `ChannelKey` inclut toujours le `TenantId`.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::protocol::FRAME_SIZE;

/// Identifiant de tenant (isolation multi-tenant stricte, contrainte #2).
pub type TenantId = Uuid;

/// Identifiant de session/connexion socket.
pub type SessionId = Uuid;

/// Capacité du buffer circulaire de chaque `broadcast::Sender`. Si un
/// abonné lent prend plus de retard que cette capacité, il reçoit une
/// `RecvError::Lagged` — c'est volontaire : on préfère faire décrocher un
/// client lent plutôt que de laisser la mémoire grossir indéfiniment.
const CHANNEL_CAPACITY: usize = 256;

/// Nombre de messages conservés par canal pour le rattrapage (Opcode
/// REPLAY 0x07). Ring buffer en mémoire : au-delà, les entrées les plus
/// anciennes sont éjectées. Un dimensionnement plus généreux (ou un
/// backend Redis à TTL) peut être branché plus tard sans changer l'API
/// publique de `MultiTenantRouter`.
const DEFAULT_HISTORY_CAPACITY: usize = 50;

/// Une entrée d'historique : le frame brut tel que publié, horodaté à la
/// réception côté serveur. Le timestamp (et non un numéro de séquence)
/// sert de curseur de rattrapage : le client REPLAY envoie "depuis quand"
/// il veut être rattrapé, sans qu'il soit nécessaire d'étendre le format
/// de frame fixe de 256 octets pour embarquer un numéro de séquence.
#[derive(Clone, Copy)]
struct HistoryEntry {
    /// Secondes Unix au moment de la publication côté serveur.
    timestamp_secs: u64,
    frame: [u8; FRAME_SIZE],
}

/// Ring buffer thread-safe des derniers messages d'un canal.
struct HistoryBuffer {
    entries: Mutex<VecDeque<HistoryEntry>>,
    capacity: usize,
}

impl HistoryBuffer {
    fn new(capacity: usize) -> Self {
        Self {
            entries: Mutex::new(VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    fn push(&self, frame: [u8; FRAME_SIZE]) {
        let mut buf = self.entries.lock().expect("mutex HistoryBuffer empoisonné");
        if buf.len() == self.capacity {
            buf.pop_front(); // éjecte l'entrée la plus ancienne (comportement ring buffer)
        }
        buf.push_back(HistoryEntry {
            timestamp_secs: now_unix_secs(),
            frame,
        });
    }

    /// Retourne, dans l'ordre chronologique, tous les frames publiés
    /// strictement après `since_secs`. `since_secs == 0` retourne tout le
    /// buffer disponible (cas "je n'ai jamais rien reçu, rattrape-moi
    /// entièrement" ou "donne-moi les N derniers messages").
    fn since(&self, since_secs: u64) -> Vec<[u8; FRAME_SIZE]> {
        let buf = self.entries.lock().expect("mutex HistoryBuffer empoisonné");
        buf.iter()
            .filter(|e| e.timestamp_secs > since_secs)
            .map(|e| e.frame)
            .collect()
    }
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("horloge système antérieure à UNIX_EPOCH")
        .as_secs()
}

/// Clé d'une souscription par motif (`app_123:orders:*`), distincte de
/// `ChannelKey` : un motif n'est jamais un canal concret et ne doit
/// jamais pouvoir être confondu avec l'un d'eux dans `channels`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct WildcardKey {
    tenant_id: TenantId,
    pattern: String,
}

/// Correspondance de glob simple : `*` capte n'importe quelle sous-chaîne
/// (y compris vide), à n'importe quelle position, en nombre arbitraire
/// dans le motif. Pas de `?`, pas de classes de caractères — suffisant
/// pour un espace de noms hiérarchique de canaux (`orders:*`,
/// `app_123:*:eu`) sans la complexité d'un moteur de regex complet.
///
/// Complexité pire cas exponentielle en théorie (backtracking naïf),
/// mais sans risque pratique ici : `channel_id` est borné à 24 octets par
/// le format de frame fixe (contrainte #1), donc l'entrée est toujours
/// minuscule.
fn glob_match(pattern: &str, candidate: &str) -> bool {
    fn helper(p: &[u8], c: &[u8]) -> bool {
        match p.first() {
            None => c.is_empty(),
            Some(b'*') => (0..=c.len()).any(|i| helper(&p[1..], &c[i..])),
            Some(pc) => c.first() == Some(pc) && helper(&p[1..], &c[1..]),
        }
    }
    helper(pattern.as_bytes(), candidate.as_bytes())
}

/// Clé composite garantissant l'isolation stricte par tuple
/// `(TenantId, ChannelId)` exigée par la contrainte #2.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ChannelKey {
    pub tenant_id: TenantId,
    pub channel_id: String,
}

impl ChannelKey {
    pub fn new(tenant_id: TenantId, channel_id: impl Into<String>) -> Self {
        Self {
            tenant_id,
            channel_id: channel_id.into(),
        }
    }

    /// Clé du méta-canal de présence associé, `"{channel}-presence"`.
    pub fn presence_key(&self) -> ChannelKey {
        ChannelKey {
            tenant_id: self.tenant_id,
            channel_id: format!("{}-presence", self.channel_id),
        }
    }
}

/// Erreurs de routage exposées par `MultiTenantRouter`.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RouterError {
    #[error("le tenant {requested} n'est pas autorisé sur cette session (attendu {session})")]
    TenantMismatch { session: TenantId, requested: TenantId },
}

/// État interne d'un canal : le bus broadcast pour les abonnés en direct,
/// et son historique de rattrapage. Combinés dans une seule entrée de
/// `DashMap` pour n'avoir qu'un seul lookup (et un seul verrou de shard)
/// par opération, plutôt que deux tables séparées à tenir synchronisées.
struct ChannelState {
    sender: broadcast::Sender<[u8; FRAME_SIZE]>,
    history: HistoryBuffer,
}

/// Router multi-tenant : détient un `broadcast::Sender` + un historique de
/// rattrapage par canal, et applique l'isolation stricte par tenant à
/// chaque opération.
///
/// `DashMap` permet des lectures/écritures concurrentes sans verrou
/// global ; chaque shard interne a son propre verrou fin.
pub struct MultiTenantRouter {
    channels: DashMap<ChannelKey, ChannelState>,
    /// Souscriptions par motif (`orders:*`) — table séparée de `channels`
    /// car un motif n'est jamais publié dessus directement, seulement
    /// consulté lors du fan-out d'une publication sur un canal concret.
    wildcards: DashMap<WildcardKey, broadcast::Sender<[u8; FRAME_SIZE]>>,
    history_capacity: usize,
}

impl MultiTenantRouter {
    pub fn new() -> Self {
        Self::with_history_capacity(DEFAULT_HISTORY_CAPACITY)
    }

    pub fn with_history_capacity(history_capacity: usize) -> Self {
        Self {
            channels: DashMap::new(),
            wildcards: DashMap::new(),
            history_capacity,
        }
    }

    /// Abonne un client à un **motif** de canaux (`orders:*`), plutôt qu'à
    /// un canal exact — roadmap "Filtrage de Messages côté Serveur /
    /// Channel Multiplexing". Contrairement à `subscribe()`, aucune erreur
    /// de tenant n'est possible ici : le motif est toujours interprété
    /// dans le tenant de la session appelante, il ne peut donc jamais
    /// pointer vers un autre tenant.
    pub fn subscribe_wildcard(
        &self,
        session_tenant: TenantId,
        pattern: impl Into<String>,
    ) -> broadcast::Receiver<[u8; FRAME_SIZE]> {
        let key = WildcardKey {
            tenant_id: session_tenant,
            pattern: pattern.into(),
        };
        self.wildcards
            .entry(key)
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .subscribe()
    }

    /// Retire les motifs qui n'ont plus aucun abonné, pour ne pas faire
    /// grossir indéfiniment `wildcards` avec des souscriptions mortes. À
    /// appeler périodiquement (ex: depuis le sweep de présence), comme
    /// `prune_empty` pour les canaux concrets.
    pub fn prune_dead_wildcards(&self) {
        self.wildcards.retain(|_, sender| sender.receiver_count() > 0);
    }

    /// Récupère (ou crée paresseusement) l'état d'un canal. `entry()`
    /// garantit qu'un seul `ChannelState` est créé même sous accès
    /// concurrent sur la même clé.
    fn state_for(&self, key: &ChannelKey) -> dashmap::mapref::one::RefMut<'_, ChannelKey, ChannelState> {
        self.channels.entry(key.clone()).or_insert_with(|| ChannelState {
            sender: broadcast::channel(CHANNEL_CAPACITY).0,
            history: HistoryBuffer::new(self.history_capacity),
        })
    }

    /// Abonne un client au canal `key`, en vérifiant que le tenant de la
    /// session correspond bien au tenant du canal demandé (contrainte #2 :
    /// une session n'est associée qu'aux canaux autorisés pour son tenant).
    pub fn subscribe(
        &self,
        session_tenant: TenantId,
        key: &ChannelKey,
    ) -> Result<broadcast::Receiver<[u8; FRAME_SIZE]>, RouterError> {
        if session_tenant != key.tenant_id {
            return Err(RouterError::TenantMismatch {
                session: session_tenant,
                requested: key.tenant_id,
            });
        }
        Ok(self.state_for(key).sender.subscribe())
    }

    /// Publie un frame sur `key` pour les abonnés déjà connectés (canal
    /// exact **et** motifs correspondants, cf. `subscribe_wildcard`), et
    /// l'ajoute à l'historique de rattrapage du canal (Opcode REPLAY).
    ///
    /// Retourne le nombre total d'abonnés actifs qui ont reçu le message
    /// (canal exact + motifs). Un retour de `0` signifie qu'aucun socket
    /// n'est branché sur ce canal, sous quelque forme d'abonnement que ce
    /// soit — c'est le signal utilisé par l'appelant (cf. `push.rs`) pour
    /// basculer vers le fallback FCM (contrainte #4).
    pub fn publish(
        &self,
        publisher_tenant: TenantId,
        key: &ChannelKey,
        frame: [u8; FRAME_SIZE],
    ) -> Result<usize, RouterError> {
        if publisher_tenant != key.tenant_id {
            return Err(RouterError::TenantMismatch {
                session: publisher_tenant,
                requested: key.tenant_id,
            });
        }

        let mut delivered = {
            let entry = self.state_for(key);
            entry.history.push(frame);
            // `send` échoue seulement si zéro receveur est branché, ce qui
            // n'est pas une erreur pour nous : ça signifie justement "hors
            // ligne", à traiter côté appelant.
            entry.sender.send(frame).unwrap_or(0)
            // `entry` (RefMut sur le shard `channels`) est relâché ici,
            // avant l'itération sur `wildcards` ci-dessous — deux tables
            // distinctes, mais on évite par principe de tenir un verrou
            // plus longtemps que nécessaire.
        };

        // Fan-out vers les souscriptions par motif de ce tenant. Le
        // nombre de motifs actifs est censé rester faible (quelques
        // dizaines au plus dans un usage réaliste type "un dashboard
        // d'admin écoute tout un espace de noms") : un scan linéaire de
        // `wildcards` par publication est largement suffisant et évite la
        // complexité d'un index/trie dédié pour un besoin qui reste marginal
        // comparé au volume de publications sur canaux exacts.
        for entry in self.wildcards.iter() {
            let wk = entry.key();
            if wk.tenant_id == key.tenant_id && glob_match(&wk.pattern, &key.channel_id) {
                delivered += entry.value().send(frame).unwrap_or(0);
            }
        }

        Ok(delivered)
    }

    /// Retourne les frames publiés sur `key` depuis `since_unix_secs`
    /// (exclusif), dans l'ordre chronologique — réponse à un Opcode
    /// REPLAY (0x07). `since_unix_secs == 0` retourne tout l'historique
    /// disponible dans le ring buffer.
    pub fn replay(
        &self,
        requester_tenant: TenantId,
        key: &ChannelKey,
        since_unix_secs: u64,
    ) -> Result<Vec<[u8; FRAME_SIZE]>, RouterError> {
        if requester_tenant != key.tenant_id {
            return Err(RouterError::TenantMismatch {
                session: requester_tenant,
                requested: key.tenant_id,
            });
        }
        Ok(self.state_for(key).history.since(since_unix_secs))
    }

    /// Nombre d'abonnés actuellement branchés sur un canal, sans publier.
    /// Utile pour décider d'un fallback push sans consommer de message.
    pub fn subscriber_count(&self, key: &ChannelKey) -> usize {
        self.channels
            .get(key)
            .map(|s| s.sender.receiver_count())
            .unwrap_or(0)
    }

    /// Supprime un canal de la table s'il n'a plus aucun abonné **et**
    /// plus d'historique à conserver, pour ne pas faire grossir
    /// indéfiniment la `DashMap` avec des canaux morts. Un canal encore
    /// porteur d'historique récent est conservé même sans abonné actif,
    /// pour que REPLAY reste possible après une déconnexion totale.
    /// À appeler périodiquement (ex: depuis le sweep de présence).
    pub fn prune_empty(&self, key: &ChannelKey) {
        self.channels.remove_if(key, |_, state| {
            state.sender.receiver_count() == 0
                && state.history.entries.lock().map(|b| b.is_empty()).unwrap_or(true)
        });
    }
}

impl Default for MultiTenantRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// État de présence d'une session connectée.
#[derive(Debug, Clone)]
pub struct PresenceEntry {
    pub tenant_id: TenantId,
    pub session_id: SessionId,
    /// Canaux (hors méta-canaux `-presence`) auxquels la session est abonnée.
    pub channels: Vec<String>,
    pub last_seen: Instant,
}

/// Moteur de présence : suit le dernier heartbeat (Opcode PING) de chaque
/// session et détecte les timeouts en tâche de fond (contrainte #3).
pub struct PresenceEngine {
    sessions: DashMap<SessionId, PresenceEntry>,
    timeout: Duration,
}

impl PresenceEngine {
    pub fn new(timeout: Duration) -> Self {
        Self {
            sessions: DashMap::new(),
            timeout,
        }
    }

    /// Enregistre une nouvelle session (évènement JOIN côté appelant).
    pub fn register(&self, tenant_id: TenantId, session_id: SessionId) {
        self.sessions.insert(
            session_id,
            PresenceEntry {
                tenant_id,
                session_id,
                channels: Vec::new(),
                last_seen: Instant::now(),
            },
        );
    }

    /// Rafraîchit le timestamp de dernière activité (reçu à chaque PING
    /// ou tout autre frame valide de la session).
    pub fn heartbeat(&self, session_id: SessionId) {
        if let Some(mut entry) = self.sessions.get_mut(&session_id) {
            entry.last_seen = Instant::now();
        }
    }

    /// Associe un canal supplémentaire à la session (suite à un SUB).
    pub fn track_channel(&self, session_id: SessionId, channel_id: impl Into<String>) {
        if let Some(mut entry) = self.sessions.get_mut(&session_id) {
            entry.channels.push(channel_id.into());
        }
    }

    /// Retire un canal précis du suivi de présence de la session (suite à
    /// un UNSUB explicite), sans retirer la session elle-même. Contrepartie
    /// de `track_channel` pour l'opcode 0x09 — avant son introduction, seul
    /// un LEAVE/TIMEOUT global (toute la session) existait.
    pub fn untrack_channel(&self, session_id: SessionId, channel_id: &str) {
        if let Some(mut entry) = self.sessions.get_mut(&session_id) {
            entry.channels.retain(|c| c != channel_id);
        }
    }

    /// Retire explicitement une session (évènement LEAVE volontaire,
    /// ex: fermeture propre du WebSocket). Retourne l'entrée retirée pour
    /// que l'appelant puisse publier le message de présence LEAVE.
    pub fn remove(&self, session_id: SessionId) -> Option<PresenceEntry> {
        self.sessions.remove(&session_id).map(|(_, v)| v)
    }

    /// Balaie toutes les sessions et retire celles dont le dernier
    /// heartbeat dépasse `timeout`. Retourne les entrées expirées
    /// (évènement TIMEOUT) pour que l'appelant publie les messages de
    /// présence correspondants sur `{channel}-presence`.
    ///
    /// Conçu pour être appelé périodiquement par une boucle Tokio
    /// (`tokio::time::interval`) tournant en tâche de fond.
    pub fn sweep_expired(&self) -> Vec<PresenceEntry> {
        let now = Instant::now();
        let expired: Vec<SessionId> = self
            .sessions
            .iter()
            .filter(|entry| now.duration_since(entry.last_seen) > self.timeout)
            .map(|entry| entry.session_id)
            .collect();

        expired
            .into_iter()
            .filter_map(|id| self.sessions.remove(&id).map(|(_, v)| v))
            .collect()
    }

    /// Nombre de sessions actives suivies, tous tenants confondus.
    pub fn active_session_count(&self) -> usize {
        self.sessions.len()
    }
}

/// État global partagé de l'application, injecté dans les handlers
/// Axum/WebSocket et dans les tâches de fond via `Arc<AppState>`.
pub struct AppState {
    pub router: MultiTenantRouter,
    pub presence: PresenceEngine,
}

impl AppState {
    pub fn new(presence_timeout: Duration) -> Arc<Self> {
        Arc::new(Self {
            router: MultiTenantRouter::new(),
            presence: PresenceEngine::new(presence_timeout),
        })
    }
}

// NOTE: la boucle de heartbeat/sweep en tâche de fond (contrainte #3) est
// implémentée dans `presence.rs` (`spawn_heartbeat_loop`), qui orchestre
// la publication des évènements JOIN/LEAVE/TIMEOUT sur les méta-canaux
// `{channel}-presence` en s'appuyant sur les primitives de cette structure.

#[cfg(test)]
mod tests {
    use super::*;

    fn tenant_a() -> TenantId {
        Uuid::from_u128(1)
    }

    fn tenant_b() -> TenantId {
        Uuid::from_u128(2)
    }

    #[test]
    fn subscribe_rejects_foreign_tenant() {
        let router = MultiTenantRouter::new();
        let key = ChannelKey::new(tenant_a(), "room-1");
        let err = router.subscribe(tenant_b(), &key).unwrap_err();
        assert_eq!(
            err,
            RouterError::TenantMismatch {
                session: tenant_b(),
                requested: tenant_a(),
            }
        );
    }

    #[tokio::test]
    async fn publish_reaches_subscribed_client_only() {
        let router = MultiTenantRouter::new();
        let key_a = ChannelKey::new(tenant_a(), "room-1");
        let key_b = ChannelKey::new(tenant_b(), "room-1"); // même nom de canal, tenant différent

        let mut rx_a = router.subscribe(tenant_a(), &key_a).unwrap();
        let _rx_b = router.subscribe(tenant_b(), &key_b).unwrap();

        let frame = crate::protocol::FrameBuilder::new(
            crate::protocol::Opcode::Message,
            tenant_a(),
        )
        .channel_id("room-1")
        .payload("hello A")
        .build();

        let delivered = router.publish(tenant_a(), &key_a, frame).unwrap();
        assert_eq!(delivered, 1);

        let received = rx_a.try_recv().unwrap();
        assert_eq!(received, frame);
    }

    #[test]
    fn publish_to_empty_channel_returns_zero_subscribers() {
        let router = MultiTenantRouter::new();
        let key = ChannelKey::new(tenant_a(), "ghost-room");
        let frame = crate::protocol::FrameBuilder::new(
            crate::protocol::Opcode::Publish,
            tenant_a(),
        )
        .build();
        // Aucun abonné : c'est le signal utilisé par push.rs pour le fallback FCM.
        let delivered = router.publish(tenant_a(), &key, frame).unwrap();
        assert_eq!(delivered, 0);
    }

    #[test]
    fn replay_returns_history_after_disconnect() {
        let router = MultiTenantRouter::new();
        let key = ChannelKey::new(tenant_a(), "room-1");

        let frame1 = crate::protocol::FrameBuilder::new(crate::protocol::Opcode::Publish, tenant_a())
            .channel_id("room-1")
            .payload("msg-1")
            .build();
        let frame2 = crate::protocol::FrameBuilder::new(crate::protocol::Opcode::Publish, tenant_a())
            .channel_id("room-1")
            .payload("msg-2")
            .build();

        // Publié sans aucun abonné connecté (le client était déconnecté).
        router.publish(tenant_a(), &key, frame1).unwrap();
        router.publish(tenant_a(), &key, frame2).unwrap();

        // since=0 => tout l'historique disponible, dans l'ordre.
        let replayed = router.replay(tenant_a(), &key, 0).unwrap();
        assert_eq!(replayed.len(), 2);
        assert_eq!(replayed[0], frame1);
        assert_eq!(replayed[1], frame2);
    }

    #[test]
    fn replay_rejects_foreign_tenant() {
        let router = MultiTenantRouter::new();
        let key = ChannelKey::new(tenant_a(), "room-1");
        let err = router.replay(tenant_b(), &key, 0).unwrap_err();
        assert_eq!(
            err,
            RouterError::TenantMismatch {
                session: tenant_b(),
                requested: tenant_a(),
            }
        );
    }

    #[test]
    fn history_buffer_evicts_oldest_beyond_capacity() {
        let router = MultiTenantRouter::with_history_capacity(2);
        let key = ChannelKey::new(tenant_a(), "room-1");

        for i in 0..3 {
            let frame = crate::protocol::FrameBuilder::new(crate::protocol::Opcode::Publish, tenant_a())
                .channel_id("room-1")
                .payload(format!("msg-{i}"))
                .build();
            router.publish(tenant_a(), &key, frame).unwrap();
        }

        let replayed = router.replay(tenant_a(), &key, 0).unwrap();
        // Capacité 2 : seuls les 2 derniers messages (msg-1, msg-2) survivent.
        assert_eq!(replayed.len(), 2);
        let frame = crate::protocol::Frame::parse(&replayed[0]).unwrap();
        assert_eq!(frame.payload(), "msg-1");
    }

    #[test]
    fn glob_match_basic_cases() {
        assert!(glob_match("orders:*", "orders:42"));
        assert!(glob_match("orders:*", "orders:"));
        assert!(!glob_match("orders:*", "invoices:42"));
        assert!(glob_match("app_123:*:eu", "app_123:orders:eu"));
        assert!(!glob_match("app_123:*:eu", "app_123:orders:us"));
        assert!(glob_match("*", "anything"));
        assert!(glob_match("exact", "exact"));
        assert!(!glob_match("exact", "exact-not"));
    }

    #[tokio::test]
    async fn wildcard_subscriber_receives_matching_publishes_only() {
        let router = MultiTenantRouter::new();
        let mut rx = router.subscribe_wildcard(tenant_a(), "orders:*");

        let matching = ChannelKey::new(tenant_a(), "orders:42");
        let non_matching = ChannelKey::new(tenant_a(), "invoices:42");

        let frame_match = crate::protocol::FrameBuilder::new(crate::protocol::Opcode::Publish, tenant_a())
            .channel_id("orders:42")
            .payload("order created")
            .build();
        let frame_no_match = crate::protocol::FrameBuilder::new(crate::protocol::Opcode::Publish, tenant_a())
            .channel_id("invoices:42")
            .payload("invoice created")
            .build();

        let delivered_match = router.publish(tenant_a(), &matching, frame_match).unwrap();
        let delivered_no_match = router.publish(tenant_a(), &non_matching, frame_no_match).unwrap();

        assert_eq!(delivered_match, 1); // le wildcard subscriber
        assert_eq!(delivered_no_match, 0); // ne matche pas le motif

        let received = rx.try_recv().unwrap();
        assert_eq!(received, frame_match);
        assert!(rx.try_recv().is_err()); // rien d'autre : invoices:42 n'a pas matché
    }

    #[test]
    fn wildcard_scoped_to_tenant() {
        let router = MultiTenantRouter::new();
        let _rx = router.subscribe_wildcard(tenant_a(), "orders:*");

        let key_b = ChannelKey::new(tenant_b(), "orders:42");
        let frame = crate::protocol::FrameBuilder::new(crate::protocol::Opcode::Publish, tenant_b())
            .channel_id("orders:42")
            .payload("order created")
            .build();

        // Même motif, mais tenant différent : le wildcard subscriber de
        // tenant_a ne doit rien recevoir d'une publication de tenant_b.
        let delivered = router.publish(tenant_b(), &key_b, frame).unwrap();
        assert_eq!(delivered, 0);
    }

    #[test]
    fn presence_untrack_channel_removes_only_that_channel() {
        let engine = PresenceEngine::new(Duration::from_millis(1));
        let session = Uuid::from_u128(1);
        engine.register(tenant_a(), session);
        engine.track_channel(session, "room-1");
        engine.track_channel(session, "room-2");

        engine.untrack_channel(session, "room-1");

        std::thread::sleep(Duration::from_millis(5));
        let expired = engine.sweep_expired();
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0].channels, vec!["room-2".to_string()]);
    }

    #[test]
    fn presence_sweep_detects_timeout() {
        let engine = PresenceEngine::new(Duration::from_millis(1));
        let session = Uuid::from_u128(42);
        engine.register(tenant_a(), session);
        engine.track_channel(session, "room-1");

        std::thread::sleep(Duration::from_millis(5));

        let expired = engine.sweep_expired();
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0].session_id, session);
        assert_eq!(engine.active_session_count(), 0);
    }

    #[test]
    fn presence_heartbeat_prevents_timeout() {
        let engine = PresenceEngine::new(Duration::from_millis(50));
        let session = Uuid::from_u128(7);
        engine.register(tenant_a(), session);

        std::thread::sleep(Duration::from_millis(20));
        engine.heartbeat(session);
        std::thread::sleep(Duration::from_millis(20));

        // Toujours dans la fenêtre de 50ms depuis le dernier heartbeat.
        let expired = engine.sweep_expired();
        assert!(expired.is_empty());
        assert_eq!(engine.active_session_count(), 1);
    }
}
