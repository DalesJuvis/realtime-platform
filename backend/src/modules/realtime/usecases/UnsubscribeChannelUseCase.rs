//! # UnsubscribeChannelUseCase
//!
//! **Action:** Handles the UNSUB opcode — explicit unsubscription from a channel or pattern.
//! **Input:** `RealtimeContext`, session ID, authenticated tenant, UNSUB `Frame`.
//! **Output:** `FrameCommand::Unsubscribed`.
//! **Side effects:** Untracks presence for exact channels.
//! **Dependencies:** `services::PresenceService`.

use crate::entities::ChannelKey::{SessionId, TenantId};
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
        return FrameCommand::None; // no UNSUB before AUTH
    };
    if tenant_id != frame.tenant_id() {
        return FrameCommand::None; // strict isolation, constraint #2
    }
    let channel_id = frame.channel_id().to_string();
    // No presence tracking for a pattern (see SUB above): nothing to
    // publish in that case, only the relay is stopped.
    if !channel_id.contains('*') {
        ctx.presence.handle_unsubscribe(tenant_id, session_id, &channel_id);
    }
    FrameCommand::Unsubscribed(channel_id)
}
