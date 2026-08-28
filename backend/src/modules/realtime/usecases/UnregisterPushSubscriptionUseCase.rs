//! # UnregisterPushSubscriptionUseCase
//!
//! **Action:** Validates a client token and removes one browser's Web
//! Push subscription — the counterpart of `UnsubscribeChannelUseCase`
//! (`UNSUB` over WS).
//! **Input:** `UnregisterPushSubscriptionDto`, the bearer token.
//! **Output:** `Ok(())`, or typed `UnregisterPushSubscriptionError`.
//! **Side effects:** Deletes from `push_subscriptions` via
//! `PushSubscriptionRepository`.
//! **Dependencies:** `auth::services::TokenService`,
//! `realtime::repositories::PushSubscriptionRepository`.

use crate::modules::auth::services::TokenService::AuthError;
use crate::modules::realtime::dto::PushSubscriptionDto::UnregisterPushSubscriptionDto;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

#[derive(Debug, thiserror::Error)]
pub enum UnregisterPushSubscriptionError {
    #[error(transparent)]
    Unauthorized(#[from] AuthError),
    #[error("storage error: {0}")]
    Storage(#[from] sqlx::Error),
}

pub async fn execute(
    ctx: &RealtimeContext,
    dto: UnregisterPushSubscriptionDto,
    token: &str,
) -> Result<(), UnregisterPushSubscriptionError> {
    ctx.auth.validate(dto.tenant_id, token)?;
    ctx.push_subscriptions.delete(dto.tenant_id, &dto.endpoint).await?;
    Ok(())
}
