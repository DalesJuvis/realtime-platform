//! # PresenceEntry
//!
//! **Action:** Presence state shape for one connected session.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`.

use std::time::Instant;

use crate::entities::ChannelKey::{SessionId, TenantId};

#[derive(Debug, Clone)]
pub struct PresenceEntry {
    pub tenant_id: TenantId,
    pub session_id: SessionId,
    /// Channels (excluding `-presence` meta-channels) this session is subscribed to.
    pub channels: Vec<String>,
    pub last_seen: Instant,
}
