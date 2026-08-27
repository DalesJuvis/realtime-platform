//! # ChannelRouterService
//!
//! **Action:** Multi-tenant pub/sub domain logic — tenant-isolation checks,
//! wildcard glob matching, and fan-out orchestration on top of
//! `ChannelStateRepository`.
//! **Input:** Tenant/session IDs, `ChannelKey`s, raw frames.
//! **Output:** `broadcast::Receiver`s, delivery counts, replayed history.
//! **Side effects:** Publishes to in-memory broadcast buses via the repository.
//! **Dependencies:** `repositories::ChannelStateRepository`, `entities::ChannelKey`, `entities::Frame`.
//!
//! No entry here is ever indexed by a tuple that would mix two tenants:
//! every operation takes the caller's tenant and cross-checks it against
//! the key's tenant before touching the repository (constraint #2).

use tokio::sync::broadcast;

use crate::entities::ChannelKey::{ChannelKey, TenantId};
use crate::entities::Frame::FRAME_SIZE;
use crate::modules::realtime::repositories::ChannelStateRepository::{
    ChannelStateRepository, WildcardKey, DEFAULT_HISTORY_CAPACITY,
};

/// Routing errors exposed by `ChannelRouterService`.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RouterError {
    #[error("tenant {requested} is not authorized on this session (expected {session})")]
    TenantMismatch { session: TenantId, requested: TenantId },
}

/// Simple glob match: `*` captures any substring (including empty), at any
/// position, any number of times. No `?`, no character classes — enough
/// for a hierarchical channel namespace (`orders:*`, `app_123:*:eu`)
/// without full regex complexity.
///
/// Worst-case exponential (naive backtracking) but harmless in practice:
/// `channel_id` is capped at 24 bytes by the fixed frame format, so the
/// input is always tiny.
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

/// Multi-tenant router: owns a `ChannelStateRepository` and applies strict
/// tenant isolation on every operation.
pub struct ChannelRouterService {
    repo: ChannelStateRepository,
}

impl ChannelRouterService {
    pub fn new() -> Self {
        Self::with_history_capacity(DEFAULT_HISTORY_CAPACITY)
    }

    pub fn with_history_capacity(history_capacity: usize) -> Self {
        Self {
            repo: ChannelStateRepository::new(history_capacity),
        }
    }

    /// Subscribes to a **pattern** of channels (`orders:*`) rather than an
    /// exact channel. No tenant error possible here: the pattern is always
    /// interpreted within the calling session's own tenant.
    pub fn subscribe_wildcard(
        &self,
        session_tenant: TenantId,
        pattern: impl Into<String>,
    ) -> broadcast::Receiver<[u8; FRAME_SIZE]> {
        let key = WildcardKey {
            tenant_id: session_tenant,
            pattern: pattern.into(),
        };
        self.repo.get_or_create_wildcard_sender(key).subscribe()
    }

    pub fn prune_dead_wildcards(&self) {
        self.repo.prune_dead_wildcards();
    }

    /// Subscribes to channel `key`, checking the session's tenant matches
    /// the channel's tenant (constraint #2).
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
        Ok(self.repo.get_or_create_channel(key).sender.subscribe())
    }

    /// Publishes a frame on `key` to already-connected subscribers (exact
    /// channel **and** matching wildcard patterns), and appends it to the
    /// channel's catch-up history.
    ///
    /// Returns the total number of active subscribers that received the
    /// message. `0` means no socket is attached to this channel under any
    /// form of subscription — the signal used by the caller to fall back
    /// to FCM push (constraint #4).
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
            let entry = self.repo.get_or_create_channel(key);
            entry.history.push(frame);
            // `send` only fails when zero receivers are attached, which is
            // not an error for us — it just means "offline", handled by the caller.
            entry.sender.send(frame).unwrap_or(0)
        };

        // Fan-out to this tenant's wildcard subscriptions. The number of
        // active patterns is expected to stay small, so a linear scan per
        // publish is plenty and avoids a dedicated index for a marginal need.
        for (wk, sender) in self.repo.snapshot_wildcards() {
            if wk.tenant_id == key.tenant_id && glob_match(&wk.pattern, &key.channel_id) {
                delivered += sender.send(frame).unwrap_or(0);
            }
        }

        Ok(delivered)
    }

    /// Frames published on `key` since `since_unix_secs` (exclusive), in
    /// chronological order — answers a REPLAY opcode (0x07). `0` returns
    /// the entire available history.
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
        Ok(self.repo.get_or_create_channel(key).history.since(since_unix_secs))
    }

    /// Number of subscribers currently attached to a channel, without publishing.
    pub fn subscriber_count(&self, key: &ChannelKey) -> usize {
        self.repo
            .get_channel(key)
            .map(|s| s.sender.receiver_count())
            .unwrap_or(0)
    }

    /// Every channel this tenant currently has state for, with its live
    /// subscriber count — see `ChannelStateRepository::list_for_tenant`.
    pub fn list_channels(&self, tenant_id: TenantId) -> Vec<(String, usize)> {
        self.repo.list_for_tenant(tenant_id)
    }

    pub fn prune_empty(&self, key: &ChannelKey) {
        self.repo.prune_empty(key);
    }
}

impl Default for ChannelRouterService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn tenant_a() -> TenantId {
        Uuid::from_u128(1)
    }

    fn tenant_b() -> TenantId {
        Uuid::from_u128(2)
    }

    #[test]
    fn subscribe_rejects_foreign_tenant() {
        let router = ChannelRouterService::new();
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
        let router = ChannelRouterService::new();
        let key_a = ChannelKey::new(tenant_a(), "room-1");
        let key_b = ChannelKey::new(tenant_b(), "room-1"); // same channel name, different tenant

        let mut rx_a = router.subscribe(tenant_a(), &key_a).unwrap();
        let _rx_b = router.subscribe(tenant_b(), &key_b).unwrap();

        let frame = crate::entities::Frame::FrameBuilder::new(
            crate::entities::Frame::Opcode::Message,
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
        let router = ChannelRouterService::new();
        let key = ChannelKey::new(tenant_a(), "ghost-room");
        let frame = crate::entities::Frame::FrameBuilder::new(
            crate::entities::Frame::Opcode::Publish,
            tenant_a(),
        )
        .build();
        let delivered = router.publish(tenant_a(), &key, frame).unwrap();
        assert_eq!(delivered, 0);
    }

    #[test]
    fn replay_returns_history_after_disconnect() {
        let router = ChannelRouterService::new();
        let key = ChannelKey::new(tenant_a(), "room-1");

        let frame1 = crate::entities::Frame::FrameBuilder::new(crate::entities::Frame::Opcode::Publish, tenant_a())
            .channel_id("room-1")
            .payload("msg-1")
            .build();
        let frame2 = crate::entities::Frame::FrameBuilder::new(crate::entities::Frame::Opcode::Publish, tenant_a())
            .channel_id("room-1")
            .payload("msg-2")
            .build();

        router.publish(tenant_a(), &key, frame1).unwrap();
        router.publish(tenant_a(), &key, frame2).unwrap();

        let replayed = router.replay(tenant_a(), &key, 0).unwrap();
        assert_eq!(replayed.len(), 2);
        assert_eq!(replayed[0], frame1);
        assert_eq!(replayed[1], frame2);
    }

    #[test]
    fn replay_rejects_foreign_tenant() {
        let router = ChannelRouterService::new();
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
        let router = ChannelRouterService::with_history_capacity(2);
        let key = ChannelKey::new(tenant_a(), "room-1");

        for i in 0..3 {
            let frame = crate::entities::Frame::FrameBuilder::new(crate::entities::Frame::Opcode::Publish, tenant_a())
                .channel_id("room-1")
                .payload(format!("msg-{i}"))
                .build();
            router.publish(tenant_a(), &key, frame).unwrap();
        }

        let replayed = router.replay(tenant_a(), &key, 0).unwrap();
        assert_eq!(replayed.len(), 2);
        let frame = crate::entities::Frame::Frame::parse(&replayed[0]).unwrap();
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
        let router = ChannelRouterService::new();
        let mut rx = router.subscribe_wildcard(tenant_a(), "orders:*");

        let matching = ChannelKey::new(tenant_a(), "orders:42");
        let non_matching = ChannelKey::new(tenant_a(), "invoices:42");

        let frame_match = crate::entities::Frame::FrameBuilder::new(crate::entities::Frame::Opcode::Publish, tenant_a())
            .channel_id("orders:42")
            .payload("order created")
            .build();
        let frame_no_match = crate::entities::Frame::FrameBuilder::new(crate::entities::Frame::Opcode::Publish, tenant_a())
            .channel_id("invoices:42")
            .payload("invoice created")
            .build();

        let delivered_match = router.publish(tenant_a(), &matching, frame_match).unwrap();
        let delivered_no_match = router.publish(tenant_a(), &non_matching, frame_no_match).unwrap();

        assert_eq!(delivered_match, 1);
        assert_eq!(delivered_no_match, 0);

        let received = rx.try_recv().unwrap();
        assert_eq!(received, frame_match);
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn wildcard_scoped_to_tenant() {
        let router = ChannelRouterService::new();
        let _rx = router.subscribe_wildcard(tenant_a(), "orders:*");

        let key_b = ChannelKey::new(tenant_b(), "orders:42");
        let frame = crate::entities::Frame::FrameBuilder::new(crate::entities::Frame::Opcode::Publish, tenant_b())
            .channel_id("orders:42")
            .payload("order created")
            .build();

        let delivered = router.publish(tenant_b(), &key_b, frame).unwrap();
        assert_eq!(delivered, 0);
    }
}
