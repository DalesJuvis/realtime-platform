//! # AuthenticateSessionUseCase
//!
//! **Action:** Validates an AUTH frame, registers the session for presence,
//! and auto-subscribes it to its private UNICAST inbox.
//! **Input:** `RealtimeContext`, session ID, AUTH `Frame`.
//! **Output:** `AuthOutcome` — the newly authenticated tenant plus the
//! transport command, or `Rejected`.
//! **Side effects:** Registers presence; subscribes to the inbox channel.
//! **Dependencies:** `services::TokenService`, `services::PresenceService`, `services::ChannelRouterService`.

use crate::entities::ChannelKey::{unicast_inbox_channel, ChannelKey, SessionId, TenantId};
use crate::entities::Frame::Frame;
use crate::modules::realtime::dto::FrameCommand::FrameCommand;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

pub enum AuthOutcome {
    Authenticated { tenant_id: TenantId, command: FrameCommand },
    Rejected,
}

pub fn execute(ctx: &RealtimeContext, session_id: SessionId, frame: &Frame<'_>) -> AuthOutcome {
    match ctx.auth.validate(frame.tenant_id(), frame.payload()) {
        Ok(claims) => {
            let tenant_id = frame.tenant_id();
            ctx.presence.handle_join(tenant_id, session_id);

            // Auto-subscribe to the user's private inbox: from AUTH
            // onward, the session can receive UNICAST without an explicit
            // SUB. No presence tracking for this inbox: it's an individual
            // addressing channel, not a shared space where JOIN/LEAVE
            // means anything to other participants.
            let inbox = ChannelKey::new(tenant_id, unicast_inbox_channel(&claims.sub));
            match ctx.channel_router.subscribe(tenant_id, &inbox) {
                Ok(rx) => AuthOutcome::Authenticated {
                    tenant_id,
                    command: FrameCommand::Subscribed(inbox.channel_id.clone(), rx),
                },
                Err(err) => {
                    // Should never happen (same tenant on both sides); if
                    // it does, the user stays authenticated but won't
                    // receive UNICAST until subscribing manually.
                    tracing::warn!(%session_id, error = %err, "UNICAST inbox auto-subscription failed");
                    AuthOutcome::Authenticated {
                        tenant_id,
                        command: FrameCommand::None,
                    }
                }
            }
        }
        Err(err) => {
            tracing::debug!(%session_id, error = %err, "authentication failed");
            AuthOutcome::Rejected
        }
    }
}
