//! # PushSubscriptionDto
//!
//! **Action:** Request/response bodies for `POST`/`DELETE
//! /api/v1/push/subscriptions` — registering and removing a browser's Web
//! Push subscription. Same auth as `PublishMessageDto`: a bearer client
//! token (`Authorization: Bearer <token>`), never the raw tenant secret.
//! `keys` mirrors the shape of the browser's own
//! `PushSubscription.toJSON()` (`{ endpoint, keys: { p256dh, auth } }`) so
//! the SDK can forward that object close to as-is.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct PushSubscriptionKeysDto {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Deserialize)]
pub struct RegisterPushSubscriptionDto {
    pub tenant_id: Uuid,
    pub endpoint: String,
    pub keys: PushSubscriptionKeysDto,
    /// Channel ids/patterns this subscription wants pushed while it has
    /// no live WS connection — same `orders:*` glob syntax as `SUB`.
    pub channels: Vec<String>,
    /// Caller-supplied, human-readable device name ("Chrome on Windows",
    /// "Safari on iPhone") — optional, so a caller that doesn't bother
    /// computing one just gets an unlabeled row rather than a rejected
    /// request. `endpoint` alone already makes one `sub` having several
    /// devices work correctly (separate rows); this only makes them
    /// identifiable when listed.
    #[serde(default)]
    pub device_label: Option<String>,
}

#[derive(Deserialize)]
pub struct UnregisterPushSubscriptionDto {
    pub tenant_id: Uuid,
    pub endpoint: String,
}

#[derive(Serialize)]
pub struct PushSubscriptionResponseDto {
    pub registered: bool,
}
