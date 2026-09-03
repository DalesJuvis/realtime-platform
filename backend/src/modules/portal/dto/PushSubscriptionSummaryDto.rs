//! # PushSubscriptionSummaryDto
//!
//! **Action:** Response/request bodies for the tenant-portal device list —
//! `GET /api/v1/portal/push-subscriptions` (list) and
//! `DELETE /api/v1/portal/push-subscriptions` (revoke one). Deliberately
//! never includes the P-256/auth crypto keys `entities::PushSubscription`
//! carries — a portal UI has no legitimate use for them, only for the
//! things that let it explain the row to a human and revoke it.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::PushSubscriptionSummary::PushSubscriptionSummary;

#[derive(Serialize)]
pub struct PushSubscriptionSummaryResponseDto {
    pub endpoint: String,
    pub sub: String,
    pub channels: Vec<String>,
    pub device_label: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<PushSubscriptionSummary> for PushSubscriptionSummaryResponseDto {
    fn from(s: PushSubscriptionSummary) -> Self {
        Self {
            endpoint: s.endpoint,
            sub: s.sub,
            channels: s.channels,
            device_label: s.device_label,
            created_at: s.created_at,
        }
    }
}

/// `endpoint` identifies the device — an arbitrary push-service URL, not
/// something that fits cleanly as a `:id` path segment, so it travels in
/// the body instead (same shape as `UnregisterPushSubscriptionDto` on the
/// client-token-authenticated side of this same table).
#[derive(Deserialize)]
pub struct RevokePushSubscriptionDto {
    pub endpoint: String,
}

/// `POST /api/v1/portal/push-subscriptions/test` — same `endpoint`-in-body
/// shape as `RevokePushSubscriptionDto`, kept as its own type since the
/// two requests mean different things even though they look alike.
#[derive(Deserialize)]
pub struct SendTestPushDto {
    pub endpoint: String,
}
