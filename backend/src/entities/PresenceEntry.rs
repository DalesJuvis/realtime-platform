//! # PresenceEntry
//!
//! **Action:** Presence state shape for one connected session.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`.

use std::time::{Instant, SystemTime};

use crate::entities::ChannelKey::{SessionId, TenantId};

#[derive(Debug, Clone)]
pub struct PresenceEntry {
    pub tenant_id: TenantId,
    pub session_id: SessionId,
    /// The `sub` claim from this session's AUTH token — which of the
    /// tenant's own users/devices this connection belongs to, for display
    /// in the portal's "devices" (live sessions) view.
    pub sub: String,
    /// Channels (excluding `-presence` meta-channels) this session is subscribed to.
    pub channels: Vec<String>,
    pub last_seen: Instant,
    /// Wall-clock connection time, for display only — `last_seen` (an
    /// `Instant`) is what the heartbeat timeout actually compares against.
    pub connected_at: SystemTime,
}
