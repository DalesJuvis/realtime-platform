//! # PublishMessageUseCase
//!
//! **Action:** Handles the PUB opcode.
//! **Input:** `RealtimeContext`, session ID, authenticated tenant, PUB `Frame`.
//! **Output:** `FrameCommand` from `PushFallbackService`.
//! **Side effects:** Publishes, fans out, and may trigger a push fallback.
//! **Dependencies:** `services::PushFallbackService`.

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
        return FrameCommand::None;
    };
    if tenant_id != frame.tenant_id() {
        return FrameCommand::None;
    }
    let key = ChannelKey::new(tenant_id, frame.channel_id());
    ctx.push_fallback.publish_and_fanout(session_id, tenant_id, &key, frame)
}
