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
    pub created_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
}

impl From<Notification> for NotificationResponseDto {
    fn from(n: Notification) -> Self {
        Self {
            id: n.id,
            channel_id: n.channel_id,
            payload: n.payload,
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
