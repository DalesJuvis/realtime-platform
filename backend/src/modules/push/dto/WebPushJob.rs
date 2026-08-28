//! # WebPushJob
//!
//! **Action:** Data shape for a message to push to one or more browser
//! Web Push subscriptions — the `WebPushPort` counterpart of `PushJob`
//! (FCM/mobile).
//! **Input:** N/A (data type + constructor).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`, `dto::WebPushSubscription`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::push::dto::WebPushSubscription::WebPushSubscription;

#[derive(Debug, Clone)]
pub struct WebPushJob {
    pub tenant_id: TenantId,
    pub channel_id: String,
    pub payload: String,
    pub subscriptions: Vec<WebPushSubscription>,
}

pub fn build_web_push_job(
    tenant_id: TenantId,
    channel_id: &str,
    payload: &str,
    subscriptions: Vec<WebPushSubscription>,
) -> WebPushJob {
    WebPushJob { tenant_id, channel_id: channel_id.to_string(), payload: payload.to_string(), subscriptions }
}
