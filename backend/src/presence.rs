//! `presence.rs` — Orchestration des évènements de présence
//! (JOIN / LEAVE / TIMEOUT, contrainte #3) et boucle heartbeat en tâche de
//! fond.
//!
//! `state::PresenceEngine` ne fait que suivre les timestamps de dernière
//! activité (structure de données pure). Ce module encode la logique
//! métier par-dessus : quand publier quoi, sur quel méta-canal, et à
//! quelle fréquence balayer les sessions expirées.

use std::sync::Arc;
use std::time::Duration;

use crate::protocol::{FrameBuilder, Opcode};
use crate::state::{AppState, ChannelKey, SessionId, TenantId};

/// Type d'évènement de présence, encodé dans le payload du frame publié
/// sur le méta-canal `{channel}-presence` sous la forme `"EVENT:session_id"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresenceEvent {
    Join,
    Leave,
    Timeout,
}

impl PresenceEvent {
    fn as_str(self) -> &'static str {
        match self {
            PresenceEvent::Join => "JOIN",
            PresenceEvent::Leave => "LEAVE",
            PresenceEvent::Timeout => "TIMEOUT",
        }
    }
}

/// Publie un frame PRESENCE sur le méta-canal `{channel_id}-presence`
/// (contrainte #3 : "Publication automatique d'un message de présence").
pub fn publish_presence_event(
    state: &AppState,
    tenant_id: TenantId,
    channel_id: &str,
    session_id: SessionId,
    event: PresenceEvent,
) {
    let key = ChannelKey::new(tenant_id, channel_id).presence_key();

    let frame = FrameBuilder::new(Opcode::Presence, tenant_id)
        .channel_id(key.channel_id.clone())
        .payload(format!("{}:{}", event.as_str(), session_id))
        .build();

    // On ignore volontairement l'erreur `TenantMismatch` : `key` est
    // construite à partir du même `tenant_id` que celui utilisé pour
    // publier, elle ne peut donc pas survenir ici en pratique. On ne
    // veut de toute façon jamais faire échouer l'appelant sur une simple
    // notification de présence best-effort.
    let _ = state.router.publish(tenant_id, &key, frame);
}

/// Enregistre une nouvelle session lors de son authentification (JOIN
/// "logique" au niveau connexion, avant tout abonnement à un canal
/// précis). Aucun message de présence n'est publié ici : tant qu'aucun
/// canal n'est connu, il n'y a nulle part où l'annoncer.
pub fn handle_join(state: &Arc<AppState>, tenant_id: TenantId, session_id: SessionId) {
    state.presence.register(tenant_id, session_id);
}

/// À appeler lorsqu'une session s'abonne à un canal (Opcode SUB) : associe
/// le canal à la session pour le suivi de présence, puis diffuse
/// l'évènement JOIN sur le méta-canal de ce canal.
pub fn handle_subscribe(
    state: &Arc<AppState>,
    tenant_id: TenantId,
    session_id: SessionId,
    channel_id: &str,
) {
    state
        .presence
        .track_channel(session_id, channel_id.to_string());
    publish_presence_event(state, tenant_id, channel_id, session_id, PresenceEvent::Join);
}

/// À appeler lorsqu'une session se désabonne explicitement d'un canal
/// (Opcode UNSUB) : retire ce canal du suivi de présence de la session
/// (sans affecter ses autres abonnements) et diffuse un LEAVE ciblé sur
/// le méta-canal de ce canal précis. Contrepartie symétrique de
/// `handle_subscribe`.
pub fn handle_unsubscribe(
    state: &Arc<AppState>,
    tenant_id: TenantId,
    session_id: SessionId,
    channel_id: &str,
) {
    state.presence.untrack_channel(session_id, channel_id);
    publish_presence_event(state, tenant_id, channel_id, session_id, PresenceEvent::Leave);
}

/// Déconnexion volontaire et propre (fermeture WebSocket/TCP normale).
/// Diffuse un LEAVE sur le méta-canal de chaque canal auquel la session
/// était abonnée, puis nettoie les canaux devenus vides.
pub fn handle_leave(state: &Arc<AppState>, session_id: SessionId) {
    let Some(entry) = state.presence.remove(session_id) else {
        return; // session inconnue ou déjà retirée (ex: par le sweeper)
    };

    for channel_id in &entry.channels {
        publish_presence_event(
            state,
            entry.tenant_id,
            channel_id,
            session_id,
            PresenceEvent::Leave,
        );
        state
            .router
            .prune_empty(&ChannelKey::new(entry.tenant_id, channel_id.clone()));
    }
}

/// Lance la boucle Tokio de heartbeat en tâche de fond : balaie
/// périodiquement les sessions dont le dernier PING dépasse le timeout
/// configuré sur `PresenceEngine`, et publie un évènement TIMEOUT pour
/// chacune sur tous ses canaux (contrainte #3).
///
/// Retourne le `JoinHandle` afin que l'appelant puisse l'annuler
/// proprement (`handle.abort()`) au moment du shutdown du serveur.
pub fn spawn_heartbeat_loop(
    state: Arc<AppState>,
    sweep_interval: Duration,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(sweep_interval);
        loop {
            ticker.tick().await;

            // Nettoyage des souscriptions par motif mortes (roadmap
            // "Channel Multiplexing") — même cadence que le sweep de
            // présence, pas besoin d'une tâche périodique dédiée pour ça.
            state.router.prune_dead_wildcards();

            for entry in state.presence.sweep_expired() {
                for channel_id in &entry.channels {
                    publish_presence_event(
                        &state,
                        entry.tenant_id,
                        channel_id,
                        entry.session_id,
                        PresenceEvent::Timeout,
                    );
                    state
                        .router
                        .prune_empty(&ChannelKey::new(entry.tenant_id, channel_id.clone()));
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[tokio::test]
    async fn subscribe_then_timeout_publishes_events_on_meta_channel() {
        let state = AppState::new(Duration::from_millis(1));
        let tenant = Uuid::from_u128(1);
        let session = Uuid::from_u128(2);

        handle_join(&state, tenant, session);
        handle_subscribe(&state, tenant, session, "room-1");

        // Un abonné externe écoute le méta-canal de présence.
        let presence_key = ChannelKey::new(tenant, "room-1").presence_key();
        let mut rx = state.router.subscribe(tenant, &presence_key).unwrap();

        // Le JOIN émis par handle_subscribe a été publié avant notre
        // abonnement ci-dessus donc non reçu ici (comportement broadcast
        // normal) ; on vérifie plutôt le TIMEOUT émis par le sweep.
        tokio::time::sleep(Duration::from_millis(5)).await;
        let expired = state.presence.sweep_expired();
        assert_eq!(expired.len(), 1);

        for entry in expired {
            for channel_id in &entry.channels {
                publish_presence_event(
                    &state,
                    entry.tenant_id,
                    channel_id,
                    entry.session_id,
                    PresenceEvent::Timeout,
                );
            }
        }

        let received = rx.try_recv().unwrap();
        let frame = crate::protocol::Frame::parse(&received).unwrap();
        assert_eq!(frame.opcode(), Opcode::Presence);
        assert!(frame.payload().starts_with("TIMEOUT:"));
    }

    #[tokio::test]
    async fn unsubscribe_publishes_leave_and_keeps_other_channels() {
        let state = AppState::new(Duration::from_secs(30));
        let tenant = Uuid::from_u128(1);
        let session = Uuid::from_u128(2);

        handle_join(&state, tenant, session);
        handle_subscribe(&state, tenant, session, "room-1");
        handle_subscribe(&state, tenant, session, "room-2");

        let presence_key = ChannelKey::new(tenant, "room-1").presence_key();
        let mut rx = state.router.subscribe(tenant, &presence_key).unwrap();

        handle_unsubscribe(&state, tenant, session, "room-1");

        let received = rx.try_recv().unwrap();
        let frame = crate::protocol::Frame::parse(&received).unwrap();
        assert!(frame.payload().starts_with("LEAVE:"));

        // La session reste active, avec seulement "room-2" encore suivi.
        assert_eq!(state.presence.active_session_count(), 1);
    }

    #[tokio::test]
    async fn leave_publishes_leave_event() {
        let state = AppState::new(Duration::from_secs(30));
        let tenant = Uuid::from_u128(1);
        let session = Uuid::from_u128(2);

        handle_join(&state, tenant, session);
        handle_subscribe(&state, tenant, session, "room-1");

        let presence_key = ChannelKey::new(tenant, "room-1").presence_key();
        let mut rx = state.router.subscribe(tenant, &presence_key).unwrap();

        handle_leave(&state, session);

        let received = rx.try_recv().unwrap();
        let frame = crate::protocol::Frame::parse(&received).unwrap();
        assert!(frame.payload().starts_with("LEAVE:"));
        assert_eq!(state.presence.active_session_count(), 0);
    }
}
