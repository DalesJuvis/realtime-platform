//! # SendTestPushUseCase
//!
//! **Action:** Sends a real Web Push notification straight to one
//! device, bypassing channel matching — the tenant-portal device list's
//! "send test notification" button.
//! **Input:** `TenantId` (from the validated portal session), `endpoint`.
//! **Output:** `()`.
//! **Dependencies:** `realtime::repositories::PushSubscriptionRepository`,
//! `realtime::services::PushFallbackService`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;
use crate::modules::push::dto::WebPushSubscription::WebPushSubscription;

const TEST_PAYLOAD: &str = "This is a test notification from mio.";

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId, endpoint: &str) -> Result<(), PortalError> {
    let subscription = ctx
        .push_subscriptions
        .find_one(tenant_id, endpoint)
        .await?
        .ok_or(PortalError::PushSubscriptionNotFound)?;

    let sent = ctx.push_fallback.send_test(
        tenant_id,
        WebPushSubscription {
            endpoint: subscription.endpoint,
            p256dh_key: subscription.p256dh_key,
            auth_key: subscription.auth_key,
        },
        TEST_PAYLOAD,
    );

    if !sent {
        return Err(PortalError::WebPushNotConfigured);
    }
    Ok(())
}
