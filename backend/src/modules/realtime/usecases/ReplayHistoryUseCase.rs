//! # ReplayHistoryUseCase
//!
//! **Action:** Handles the REPLAY opcode — catch-up history retrieval.
//! **Input:** `RealtimeContext`, session ID, authenticated tenant, REPLAY `Frame`.
//! **Output:** `FrameCommand::Replayed` with matching frames.
//! **Side effects:** None (read-only).
//! **Dependencies:** `services::ChannelRouterService`.

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
        return FrameCommand::None; // no REPLAY before AUTH
    };
    if tenant_id != frame.tenant_id() {
        return FrameCommand::None; // strict isolation, constraint #2
    }
    let channel_id = frame.channel_id();
    if channel_id.contains('*') {
        // History is indexed by exact channel, not by pattern: replaying a
        // pattern would require aggregating history across every concrete
        // channel it ever matched, which isn't tracked as such. Not
        // supported for now rather than silently returning a misleading
        // partial result.
        tracing::debug!(%session_id, "REPLAY on pattern not supported, ignored");
        return FrameCommand::None;
    }
    // Payload = Unix timestamp (seconds, decimal ASCII) since which the
    // client wants to catch up. "0" or an empty/non-numeric payload =>
    // the whole history available in the channel's ring buffer.
    let since_secs: u64 = frame.payload().trim().parse().unwrap_or(0);
    let key = ChannelKey::new(tenant_id, frame.channel_id());
    match ctx.channel_router.replay(tenant_id, &key, since_secs) {
        Ok(frames) => FrameCommand::Replayed(frames),
        Err(err) => {
            tracing::debug!(%session_id, error = %err, "REPLAY rejected");
            FrameCommand::None
        }
    }
}
