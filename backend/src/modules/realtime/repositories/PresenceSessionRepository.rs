//! # PresenceSessionRepository
//!
//! **Action:** Raw concurrent storage of per-session presence state
//! (last-seen heartbeat, tracked channels).
//! **Input:** Session/tenant IDs, channel names.
//! **Output:** `PresenceEntry` records.
//! **Side effects:** In-memory `DashMap` mutation only.
//! **Dependencies:** `dashmap`, `entities::PresenceEntry`, `entities::ChannelKey`.

use std::time::{Duration, Instant, SystemTime};

use dashmap::DashMap;

use crate::entities::ChannelKey::{SessionId, TenantId};
use crate::entities::PresenceEntry::PresenceEntry;

/// Raw storage of connected-session presence state and its expiry query.
pub struct PresenceSessionRepository {
    sessions: DashMap<SessionId, PresenceEntry>,
    timeout: Duration,
}

impl PresenceSessionRepository {
    pub fn new(timeout: Duration) -> Self {
        Self {
            sessions: DashMap::new(),
            timeout,
        }
    }

    pub fn register(&self, tenant_id: TenantId, session_id: SessionId, sub: String) {
        self.sessions.insert(
            session_id,
            PresenceEntry {
                tenant_id,
                session_id,
                sub,
                channels: Vec::new(),
                last_seen: Instant::now(),
                connected_at: SystemTime::now(),
            },
        );
    }

    /// Non-destructive snapshot of every currently tracked session for one
    /// tenant — the portal's "devices" (live sessions) view. Unlike
    /// `sweep_expired`, doesn't remove anything and doesn't filter by
    /// timeout (a session already past `timeout` but not yet swept is
    /// still "live" from the caller's perspective until the next sweep).
    pub fn list_for_tenant(&self, tenant_id: TenantId) -> Vec<PresenceEntry> {
        self.sessions
            .iter()
            .filter(|entry| entry.tenant_id == tenant_id)
            .map(|entry| entry.clone())
            .collect()
    }

    pub fn heartbeat(&self, session_id: SessionId) {
        if let Some(mut entry) = self.sessions.get_mut(&session_id) {
            entry.last_seen = Instant::now();
        }
    }

    pub fn track_channel(&self, session_id: SessionId, channel_id: impl Into<String>) {
        if let Some(mut entry) = self.sessions.get_mut(&session_id) {
            entry.channels.push(channel_id.into());
        }
    }

    pub fn untrack_channel(&self, session_id: SessionId, channel_id: &str) {
        if let Some(mut entry) = self.sessions.get_mut(&session_id) {
            entry.channels.retain(|c| c != channel_id);
        }
    }

    pub fn remove(&self, session_id: SessionId) -> Option<PresenceEntry> {
        self.sessions.remove(&session_id).map(|(_, v)| v)
    }

    /// Sweeps all sessions and removes those whose last heartbeat exceeds
    /// the configured timeout, returning the removed entries.
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

    pub fn active_session_count(&self) -> usize {
        self.sessions.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn tenant_a() -> TenantId {
        Uuid::from_u128(1)
    }

    #[test]
    fn untrack_channel_removes_only_that_channel() {
        let repo = PresenceSessionRepository::new(Duration::from_millis(1));
        let session = Uuid::from_u128(1);
        repo.register(tenant_a(), session, "user-1".to_string());
        repo.track_channel(session, "room-1");
        repo.track_channel(session, "room-2");

        repo.untrack_channel(session, "room-1");

        std::thread::sleep(Duration::from_millis(5));
        let expired = repo.sweep_expired();
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0].channels, vec!["room-2".to_string()]);
    }

    #[test]
    fn sweep_detects_timeout() {
        let repo = PresenceSessionRepository::new(Duration::from_millis(1));
        let session = Uuid::from_u128(42);
        repo.register(tenant_a(), session, "user-1".to_string());
        repo.track_channel(session, "room-1");

        std::thread::sleep(Duration::from_millis(5));

        let expired = repo.sweep_expired();
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0].session_id, session);
        assert_eq!(repo.active_session_count(), 0);
    }

    #[test]
    fn heartbeat_prevents_timeout() {
        let repo = PresenceSessionRepository::new(Duration::from_millis(50));
        let session = Uuid::from_u128(7);
        repo.register(tenant_a(), session, "user-1".to_string());

        std::thread::sleep(Duration::from_millis(20));
        repo.heartbeat(session);
        std::thread::sleep(Duration::from_millis(20));

        let expired = repo.sweep_expired();
        assert!(expired.is_empty());
        assert_eq!(repo.active_session_count(), 1);
    }
}
