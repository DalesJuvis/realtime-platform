//! # SubscribeChannelUseCase
//!
//! **Action:** Handles the SUB opcode — exact-channel or wildcard-pattern subscription.
//! **Input:** `RealtimeContext`, session ID, authenticated tenant, SUB `Frame`.
//! **Output:** `FrameCommand::Subscribed` on success, `None` otherwise.
//! **Side effects:** Registers a broadcast subscription; tracks presence for exact channels.
//! **Dependencies:** `services::ChannelRouterService`, `services::PresenceService`.

use crate::entities::ChannelKey::{ChannelKey, SessionId, TenantId};
use crate::entities::Frame::Frame;
use crate::modules::realtime::dto::FrameCommand::FrameCommand;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

pub fn execute(
    ctx: &RealtimeContext,
    session_id: SessionId,
    authenticated_tenant: Option<TenantId>,
    frame: &Frame<'_>,
) -> FrameCommand {
    let Some(tenant_id) = authenticated_tenant else {
        return FrameCommand::None; // no SUB before AUTH
    };
    if tenant_id != frame.tenant_id() {
        return FrameCommand::None; // strict isolation, constraint #2
    }

    let channel_id = frame.channel_id();
    if channel_id.contains('*') {
        // Pattern subscription: no presence tracking here — a pattern
        // names no concrete channel to publish a coherent JOIN/LEAVE on.
        let rx = ctx.channel_router.subscribe_wildcard(tenant_id, channel_id);
        return FrameCommand::Subscribed(channel_id.to_string(), rx);
    }

    let key = ChannelKey::new(tenant_id, channel_id);
    match ctx.channel_router.subscribe(tenant_id, &key) {
        Ok(rx) => {
            ctx.presence.handle_subscribe(tenant_id, session_id, channel_id);
            FrameCommand::Subscribed(channel_id.to_string(), rx)
        }
        Err(err) => {
            tracing::debug!(%session_id, error = %err, "SUB rejected");
            FrameCommand::None
        }
    }
}
