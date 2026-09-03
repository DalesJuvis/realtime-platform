//! # RegisterPushSubscriptionUseCase
//!
//! **Action:** Validates a client token and upserts one browser's Web
//! Push subscription — the counterpart of `SubscribeChannelUseCase`
//! (`SUB` over WS) for a client with no live connection: this is how it
//! tells the backend which channels to push it while it isn't listening.
//! **Input:** `RegisterPushSubscriptionDto`, the bearer token.
//! **Output:** `Ok(())`, or typed `RegisterPushSubscriptionError`.
//! **Side effects:** Writes to `push_subscriptions` via
//! `PushSubscriptionRepository`.
//! **Dependencies:** `auth::services::TokenService`,
//! `realtime::repositories::PushSubscriptionRepository`.

use crate::entities::PushSubscription::PushSubscription;
use crate::modules::auth::services::TokenService::AuthError;
use crate::modules::realtime::dto::PushSubscriptionDto::RegisterPushSubscriptionDto;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

#[derive(Debug, thiserror::Error)]
pub enum RegisterPushSubscriptionError {
    #[error(transparent)]
    Unauthorized(#[from] AuthError),
    #[error("storage error: {0}")]
    Storage(#[from] sqlx::Error),
}

pub async fn execute(
    ctx: &RealtimeContext,
    dto: RegisterPushSubscriptionDto,
    token: &str,
) -> Result<(), RegisterPushSubscriptionError> {
    let claims = ctx.auth.validate(dto.tenant_id, token)?;

    let subscription = PushSubscription {
        endpoint: dto.endpoint,
        tenant_id: dto.tenant_id,
        sub: claims.sub,
        p256dh_key: dto.keys.p256dh,
        auth_key: dto.keys.auth,
        channels: dto.channels,
        device_label: dto.device_label,
    };
    ctx.push_subscriptions.upsert(&subscription).await?;

    Ok(())
}
