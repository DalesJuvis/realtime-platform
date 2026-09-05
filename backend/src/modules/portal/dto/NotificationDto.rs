//! # NotificationDto
//!
//! **Action:** Response bodies for the notification bell endpoints —
//! `GET /api/v1/portal/notifications`,
//! `POST /api/v1/portal/notifications/:id/read`,
//! `POST /api/v1/portal/notifications/read-all`.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::entities::Notification::Notification;

#[derive(Serialize)]
pub struct NotificationResponseDto {
    pub id: Uuid,
    pub channel_id: String,
    pub payload: String,
    /// `"realtime"` or `"push"` — which path this message actually went
    /// out on, see `NotificationDelivery`'s doc comment. Plain `&str`
    /// rather than re-deriving `Serialize` on the entity enum: this DTO
    /// is the one place that string shape is a public API contract.
    pub delivery: &'static str,
    pub created_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
}

impl From<Notification> for NotificationResponseDto {
    fn from(n: Notification) -> Self {
        Self {
            id: n.id,
            channel_id: n.channel_id,
            payload: n.payload,
            delivery: n.delivery.as_str(),
            created_at: n.created_at,
            read_at: n.read_at,
        }
    }
}

/// One call gets both the feed and the badge count — the bell only ever
/// needs these two things together, never one without the other.
#[derive(Serialize)]
pub struct NotificationListResponseDto {
    pub items: Vec<NotificationResponseDto>,
    pub unread_count: i64,
}
