//! # PresenceService
//!
//! **Action:** Orchestrates JOIN/LEAVE/TIMEOUT presence events and the
//! background heartbeat sweep loop.
//! **Input:** Tenant/session IDs, channel names.
//! **Output:** Presence frames published on `{channel}-presence` meta-channels.
//! **Side effects:** Publishes via `ChannelRouterService`; spawns a background Tokio task.
//! **Dependencies:** `repositories::PresenceSessionRepository`, `services::ChannelRouterService` (cross-domain), `entities::Frame`, `entities::PresenceEvent`.
//!
//! `PresenceSessionRepository` only tracks last-activity timestamps (pure
//! data). This service layers the business logic on top: when to publish
//! what, on which meta-channel, and how often to sweep expired sessions.

use std::sync::Arc;
use std::time::Duration;

use crate::entities::ChannelKey::{ChannelKey, SessionId, TenantId};
use crate::entities::Frame::{FrameBuilder, Opcode};
use crate::entities::PresenceEvent::PresenceEvent;
use crate::modules::realtime::repositories::PresenceSessionRepository::PresenceSessionRepository;
use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;

pub struct PresenceService {
    repo: PresenceSessionRepository,
    channel_router: Arc<ChannelRouterService>,
}

impl PresenceService {
    pub fn new(timeout: Duration, channel_router: Arc<ChannelRouterService>) -> Arc<Self> {
        Arc::new(Self {
            repo: PresenceSessionRepository::new(timeout),
            channel_router,
        })
    }

    /// Publishes a PRESENCE frame on `{channel_id}-presence` (constraint #3).
    fn publish_presence_event(
        &self,
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

        // `TenantMismatch` cannot happen here in practice: `key` is built
        // from the same `tenant_id` used to publish. This is a best-effort
        // notification that must never fail the caller.
        let _ = self.channel_router.publish(tenant_id, &key, frame);
    }

    /// Registers a new session on authentication (connection-level "logical"
    /// JOIN, before any channel subscription). No presence message is
    /// published here: with no known channel yet, there's nowhere to announce it.
    pub fn handle_join(&self, tenant_id: TenantId, session_id: SessionId, sub: String) {
        self.repo.register(tenant_id, session_id, sub);
    }

    /// Live sessions for one tenant — the portal's "devices" view. See
    /// `PresenceSessionRepository::list_for_tenant`'s doc comment.
    pub fn list_sessions(&self, tenant_id: TenantId) -> Vec<crate::entities::PresenceEntry::PresenceEntry> {
        self.repo.list_for_tenant(tenant_id)
    }

    pub fn heartbeat(&self, session_id: SessionId) {
        self.repo.heartbeat(session_id);
    }

    /// Call when a session subscribes to a channel (SUB): tracks the
    /// channel for presence, then broadcasts JOIN on its meta-channel.
    pub fn handle_subscribe(&self, tenant_id: TenantId, session_id: SessionId, channel_id: &str) {
        self.repo.track_channel(session_id, channel_id.to_string());
        self.publish_presence_event(tenant_id, channel_id, session_id, PresenceEvent::Join);
    }

    /// Call when a session explicitly unsubscribes from a channel (UNSUB):
    /// stops tracking that channel (without affecting other subscriptions)
    /// and broadcasts a targeted LEAVE. Symmetric counterpart of `handle_subscribe`.
    pub fn handle_unsubscribe(&self, tenant_id: TenantId, session_id: SessionId, channel_id: &str) {
        self.repo.untrack_channel(session_id, channel_id);
        self.publish_presence_event(tenant_id, channel_id, session_id, PresenceEvent::Leave);
    }

    /// Voluntary, clean disconnection (normal WebSocket/TCP close).
    /// Broadcasts LEAVE on every channel the session was subscribed to,
    /// then prunes channels left empty.
    pub fn handle_leave(&self, session_id: SessionId) {
        let Some(entry) = self.repo.remove(session_id) else {
            return; // unknown session, or already removed by the sweeper
        };

        for channel_id in &entry.channels {
            self.publish_presence_event(entry.tenant_id, channel_id, session_id, PresenceEvent::Leave);
            self.channel_router
                .prune_empty(&ChannelKey::new(entry.tenant_id, channel_id.clone()));
        }
    }

    /// Launches the background Tokio heartbeat loop: periodically sweeps
    /// sessions whose last PING exceeds the configured timeout, and
    /// publishes a TIMEOUT event on each of their channels (constraint #3).
    ///
    /// Returns the `JoinHandle` so the caller can cancel it cleanly
    /// (`handle.abort()`) on server shutdown.
    pub fn spawn_heartbeat_loop(
        self: Arc<Self>,
        sweep_interval: Duration,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(sweep_interval);
            loop {
                ticker.tick().await;

                self.channel_router.prune_dead_wildcards();

                for entry in self.repo.sweep_expired() {
                    for channel_id in &entry.channels {
                        self.publish_presence_event(
                            entry.tenant_id,
                            channel_id,
                            entry.session_id,
                            PresenceEvent::Timeout,
                        );
                        self.channel_router
                            .prune_empty(&ChannelKey::new(entry.tenant_id, channel_id.clone()));
                    }
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn make_service(timeout: Duration) -> Arc<PresenceService> {
        let router = Arc::new(ChannelRouterService::new());
        PresenceService::new(timeout, router)
    }

    #[tokio::test]
    async fn subscribe_then_timeout_publishes_events_on_meta_channel() {
        let service = make_service(Duration::from_millis(1));
        let tenant = Uuid::from_u128(1);
        let session = Uuid::from_u128(2);

        service.handle_join(tenant, session, "user-1".to_string());
        service.handle_subscribe(tenant, session, "room-1");

        let presence_key = ChannelKey::new(tenant, "room-1").presence_key();
        let mut rx = service.channel_router.subscribe(tenant, &presence_key).unwrap();

        // The JOIN emitted by handle_subscribe happened before this
        // subscription, so it isn't received here (normal broadcast
        // behavior) — instead we check the TIMEOUT emitted by the sweep.
        tokio::time::sleep(Duration::from_millis(5)).await;
        let expired = service.repo.sweep_expired();
        assert_eq!(expired.len(), 1);

        for entry in expired {
            for channel_id in &entry.channels {
                service.publish_presence_event(
                    entry.tenant_id,
                    channel_id,
                    entry.session_id,
                    PresenceEvent::Timeout,
                );
            }
        }

        let received = rx.try_recv().unwrap();
        let frame = crate::entities::Frame::Frame::parse(&received).unwrap();
        assert_eq!(frame.opcode(), Opcode::Presence);
        assert!(frame.payload().starts_with("TIMEOUT:"));
    }

    #[tokio::test]
    async fn unsubscribe_publishes_leave_and_keeps_other_channels() {
        let service = make_service(Duration::from_secs(30));
        let tenant = Uuid::from_u128(1);
        let session = Uuid::from_u128(2);

        service.handle_join(tenant, session, "user-1".to_string());
        service.handle_subscribe(tenant, session, "room-1");
        service.handle_subscribe(tenant, session, "room-2");

        let presence_key = ChannelKey::new(tenant, "room-1").presence_key();
        let mut rx = service.channel_router.subscribe(tenant, &presence_key).unwrap();

        service.handle_unsubscribe(tenant, session, "room-1");

        let received = rx.try_recv().unwrap();
        let frame = crate::entities::Frame::Frame::parse(&received).unwrap();
        assert!(frame.payload().starts_with("LEAVE:"));

        assert_eq!(service.repo.active_session_count(), 1);
    }

    #[tokio::test]
    async fn leave_publishes_leave_event() {
        let service = make_service(Duration::from_secs(30));
        let tenant = Uuid::from_u128(1);
        let session = Uuid::from_u128(2);

        service.handle_join(tenant, session, "user-1".to_string());
        service.handle_subscribe(tenant, session, "room-1");

        let presence_key = ChannelKey::new(tenant, "room-1").presence_key();
        let mut rx = service.channel_router.subscribe(tenant, &presence_key).unwrap();

        service.handle_leave(session);

        let received = rx.try_recv().unwrap();
        let frame = crate::entities::Frame::Frame::parse(&received).unwrap();
        assert!(frame.payload().starts_with("LEAVE:"));
        assert_eq!(service.repo.active_session_count(), 0);
    }
}
