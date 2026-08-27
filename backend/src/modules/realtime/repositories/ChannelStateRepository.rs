//! # ChannelStateRepository
//!
//! **Action:** Raw concurrent storage for per-channel broadcast buses,
//! their catch-up history ring buffers, and wildcard-pattern subscription
//! senders.
//! **Input:** `ChannelKey` / wildcard pattern lookups.
//! **Output:** `broadcast::Sender`/history handles.
//! **Side effects:** In-memory `DashMap` mutation only.
//! **Dependencies:** `dashmap`, `tokio::sync::broadcast`, `entities::Frame`, `entities::ChannelKey`.
//!
//! Pure data access: no tenant-isolation checks and no wildcard glob
//! matching here — that business logic lives one layer up, in
//! `services::ChannelRouterService`. `DashMap` gives lock-free (sharded)
//! concurrent access, avoiding a global `RwLock<HashMap<..>>` contention
//! point under multi-tenant load.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use tokio::sync::broadcast;

use crate::entities::ChannelKey::{ChannelKey, TenantId};
use crate::entities::Frame::FRAME_SIZE;

/// Capacity of each channel's `broadcast::Sender` ring buffer. A subscriber
/// that lags beyond this gets `RecvError::Lagged` — intentional: a slow
/// client should drop behind rather than let memory grow unbounded.
const CHANNEL_CAPACITY: usize = 256;

/// Default number of messages retained per channel for REPLAY catch-up.
pub const DEFAULT_HISTORY_CAPACITY: usize = 50;

#[derive(Clone, Copy)]
struct HistoryEntry {
    timestamp_secs: u64,
    frame: [u8; FRAME_SIZE],
}

/// Thread-safe ring buffer of a channel's most recent messages.
pub struct HistoryBuffer {
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

    pub fn push(&self, frame: [u8; FRAME_SIZE]) {
        let mut buf = self.entries.lock().expect("HistoryBuffer mutex poisoned");
        if buf.len() == self.capacity {
            buf.pop_front();
        }
        buf.push_back(HistoryEntry {
            timestamp_secs: now_unix_secs(),
            frame,
        });
    }

    /// Frames published strictly after `since_secs`, in chronological
    /// order. `since_secs == 0` returns the whole available buffer.
    pub fn since(&self, since_secs: u64) -> Vec<[u8; FRAME_SIZE]> {
        let buf = self.entries.lock().expect("HistoryBuffer mutex poisoned");
        buf.iter()
            .filter(|e| e.timestamp_secs > since_secs)
            .map(|e| e.frame)
            .collect()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.lock().map(|b| b.is_empty()).unwrap_or(true)
    }
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock predates UNIX_EPOCH")
        .as_secs()
}

/// Key of a wildcard subscription (`app_123:orders:*`), distinct from
/// `ChannelKey`: a pattern is never a concrete channel.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct WildcardKey {
    pub tenant_id: TenantId,
    pub pattern: String,
}

/// A channel's broadcast bus plus its catch-up history, combined in one
/// `DashMap` entry so an operation costs a single lookup/shard-lock rather
/// than two tables kept in sync.
pub struct ChannelState {
    pub sender: broadcast::Sender<[u8; FRAME_SIZE]>,
    pub history: HistoryBuffer,
}

/// Raw `DashMap`-backed storage for channel state and wildcard subscriptions.
pub struct ChannelStateRepository {
    channels: DashMap<ChannelKey, ChannelState>,
    wildcards: DashMap<WildcardKey, broadcast::Sender<[u8; FRAME_SIZE]>>,
    history_capacity: usize,
}

impl ChannelStateRepository {
    pub fn new(history_capacity: usize) -> Self {
        Self {
            channels: DashMap::new(),
            wildcards: DashMap::new(),
            history_capacity,
        }
    }

    /// Fetches (or lazily creates) a channel's state. `entry()` guarantees
    /// only one `ChannelState` is ever created under concurrent access to
    /// the same key.
    pub fn get_or_create_channel(
        &self,
        key: &ChannelKey,
    ) -> dashmap::mapref::one::RefMut<'_, ChannelKey, ChannelState> {
        self.channels.entry(key.clone()).or_insert_with(|| ChannelState {
            sender: broadcast::channel(CHANNEL_CAPACITY).0,
            history: HistoryBuffer::new(self.history_capacity),
        })
    }

    pub fn get_channel(
        &self,
        key: &ChannelKey,
    ) -> Option<dashmap::mapref::one::Ref<'_, ChannelKey, ChannelState>> {
        self.channels.get(key)
    }

    /// Snapshot of every channel this tenant currently has state for
    /// (`channel_id`, live subscriber count) — channels are never a
    /// first-class persisted entity in this system, only born implicitly
    /// on first SUB/PUB and pruned once empty (`prune_empty`), so this is
    /// the actual source of truth for "what channels does this tenant
    /// have", not a separate registry.
    pub fn list_for_tenant(&self, tenant_id: TenantId) -> Vec<(String, usize)> {
        self.channels
            .iter()
            .filter(|entry| entry.key().tenant_id == tenant_id)
            .map(|entry| (entry.key().channel_id.clone(), entry.value().sender.receiver_count()))
            .collect()
    }

    pub fn get_or_create_wildcard_sender(
        &self,
        key: WildcardKey,
    ) -> broadcast::Sender<[u8; FRAME_SIZE]> {
        self.wildcards
            .entry(key)
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    /// Snapshot of all wildcard subscriptions. Cloning each `Sender` (cheap
    /// — it's an `Arc` internally) lets the caller iterate without holding
    /// any `DashMap` shard lock while matching/publishing.
    pub fn snapshot_wildcards(&self) -> Vec<(WildcardKey, broadcast::Sender<[u8; FRAME_SIZE]>)> {
        self.wildcards
            .iter()
            .map(|e| (e.key().clone(), e.value().clone()))
            .collect()
    }

    /// Drops wildcard subscriptions with no remaining receivers, so
    /// `wildcards` doesn't grow unbounded with dead subscriptions.
    pub fn prune_dead_wildcards(&self) {
        self.wildcards.retain(|_, sender| sender.receiver_count() > 0);
    }

    /// Drops a channel once it has no subscribers left **and** no history
    /// worth keeping. A channel still carrying recent history is kept even
    /// without an active subscriber, so REPLAY remains possible after a
    /// full disconnect.
    pub fn prune_empty(&self, key: &ChannelKey) {
        self.channels
            .remove_if(key, |_, state| state.sender.receiver_count() == 0 && state.history.is_empty());
    }
}
