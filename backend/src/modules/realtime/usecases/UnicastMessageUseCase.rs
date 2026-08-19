//! # UnicastMessageUseCase
//!
//! **Action:** Handles the UNICAST opcode — direct delivery to a resolved
//! user inbox instead of an explicit channel.
//! **Input:** `RealtimeContext`, session ID, authenticated tenant, UNICAST `Frame`.
//! **Output:** `FrameCommand` from `PushFallbackService`.
//! **Side effects:** Publishes, fans out, and may trigger a push fallback.
//! **Dependencies:** `services::PushFallbackService`, `entities::ChannelKey`.

use crate::entities::ChannelKey::{unicast_inbox_channel, ChannelKey, SessionId, TenantId};
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
        return FrameCommand::None;
    };
    if tenant_id != frame.tenant_id() {
        return FrameCommand::None;
    }
    // `channel_id` is repurposed: it carries the recipient's ID, resolved
    // to their private inbox (see `Opcode::Unicast` docs).
    let target_user_id = frame.channel_id();
    let key = ChannelKey::new(tenant_id, unicast_inbox_channel(target_user_id));
    ctx.push_fallback.publish_and_fanout(session_id, tenant_id, &key, frame)
}
