//! # SessionSummaryDto
//!
//! **Action:** Response shape for `GET /api/v1/portal/sessions` — the
//! portal's "devices" (live connected sessions) view. One entry per
//! `PresenceEntry` currently tracked for the caller's tenant.

use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct SessionSummaryDto {
    pub session_id: Uuid,
    pub sub: String,
    pub channels: Vec<String>,
    pub connected_at: String,
}

impl From<crate::entities::PresenceEntry::PresenceEntry> for SessionSummaryDto {
    fn from(entry: crate::entities::PresenceEntry::PresenceEntry) -> Self {
        Self {
            session_id: entry.session_id,
            sub: entry.sub,
            channels: entry.channels,
            connected_at: chrono::DateTime::<chrono::Utc>::from(entry.connected_at).to_rfc3339(),
        }
    }
}
