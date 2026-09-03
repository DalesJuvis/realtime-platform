//! # RevokePushSubscriptionUseCase
//!
//! **Action:** Removes one device's Web Push subscription, scoped to the
//! caller's own tenant — the portal-session-authenticated counterpart of
//! `UnregisterPushSubscriptionUseCase` (which only lets a browser remove
//! *itself*); this lets a tenant admin revoke any of their tenant's
//! devices from the portal's device list.
//! **Input:** `TenantId` (from the validated portal session), `endpoint`.
//! **Output:** `()`.
//! **Dependencies:** `realtime::repositories::PushSubscriptionRepository`.

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId, endpoint: &str) -> Result<(), PortalError> {
    ctx.push_subscriptions.delete(tenant_id, endpoint).await?;
    Ok(())
}
