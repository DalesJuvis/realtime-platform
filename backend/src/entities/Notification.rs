//! # Notification
//!
//! **Action:** A durable record of one published message, kept so a
//! tenant-portal user can see what they received even if they weren't
//! connected (or open the app) at the moment it was published — the
//! backing data behind the portal's notification bell.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`, `uuid`, `chrono`.

use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;

/// Which path a notification actually went out on — decided once, at
/// publish time, by whether `ChannelRouterService::publish` found a
/// session subscribed locally (see `PushFallbackService::publish_and_fanout`).
/// Stored as plain text (`"realtime"`/`"push"`) rather than an integer so
/// the column stays self-describing in a raw `sqlite3` shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotificationDelivery {
    /// A session was subscribed locally when this was published.
    Realtime,
    /// No local subscriber — push fallback was attempted (FCM and/or Web
    /// Push, depending on what's configured and who's subscribed;
    /// this reflects the attempt, not a confirmed device delivery).
    Push,
}

impl NotificationDelivery {
    pub fn as_str(self) -> &'static str {
        match self {
            NotificationDelivery::Realtime => "realtime",
            NotificationDelivery::Push => "push",
        }
    }

    /// Unrecognized/legacy values fall back to `Realtime` — the column's
    /// own `DEFAULT 'realtime'` for rows written before it existed.
    pub fn from_str(raw: &str) -> Self {
        match raw {
            "push" => NotificationDelivery::Push,
            _ => NotificationDelivery::Realtime,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Notification {
    pub id: Uuid,
    pub tenant_id: TenantId,
    pub channel_id: String,
    pub payload: String,
    pub delivery: NotificationDelivery,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub read_at: Option<chrono::DateTime<chrono::Utc>>,
}
