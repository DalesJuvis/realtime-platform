//! # HeartbeatUseCase
//!
//! **Action:** Refreshes a session's last-seen timestamp on PING.
//! **Input:** `RealtimeContext`, session ID, currently authenticated tenant (if any).
//! **Output:** `FrameCommand::None`.
//! **Side effects:** Updates presence heartbeat.
//! **Dependencies:** `services::PresenceService`.

use crate::entities::ChannelKey::{SessionId, TenantId};
use crate::modules::realtime::dto::FrameCommand::FrameCommand;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

pub fn execute(
    ctx: &RealtimeContext,
    session_id: SessionId,
    authenticated_tenant: Option<TenantId>,
) -> FrameCommand {
    if authenticated_tenant.is_some() {
        ctx.presence.heartbeat(session_id);
    }
    FrameCommand::None
}
