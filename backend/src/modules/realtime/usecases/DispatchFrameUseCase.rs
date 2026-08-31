//! # DispatchFrameUseCase
//!
//! **Action:** Orchestrates a single inbound frame end to end: routes it
//! to the matching opcode use case, times processing, and records metrics.
//! **Input:** `RealtimeContext`, session ID, mutable authenticated-tenant
//! slot, parsed `Frame`.
//! **Output:** `FrameCommand` for the transport controller to act on.
//! **Side effects:** Mutates `authenticated_tenant` on successful AUTH; records frame-processing metrics.
//! **Dependencies:** Every opcode use case in this module.
//!
//! Owns the transaction boundary for "one inbound frame" the way a
//! UseCase should: it never touches transport primitives (WebSocket/TCP
//! types) — that belongs to `controllers::WsController`/`TcpController`.

use std::time::Instant;

use crate::entities::ChannelKey::{SessionId, TenantId};
use crate::entities::Frame::Frame;
use crate::modules::realtime::dto::FrameCommand::FrameCommand;
use crate::modules::realtime::usecases::AuthenticateSessionUseCase::{self, AuthOutcome};
use crate::modules::realtime::usecases::HeartbeatUseCase;
use crate::modules::realtime::usecases::PublishMessageUseCase;
use crate::modules::realtime::usecases::ReplayHistoryUseCase;
use crate::modules::realtime::usecases::SubscribeChannelUseCase;
use crate::modules::realtime::usecases::UnicastMessageUseCase;
use crate::modules::realtime::usecases::UnsubscribeChannelUseCase;
use crate::entities::Frame::Opcode;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

/// Processes an already-parsed frame: business logic shared by WS/TCP
/// (auth, heartbeat, sub, pub + push fallback).
///
/// Measures and records processing latency plus a per-tenant/opcode
/// message counter, for `/api/v1/system/metrics`. Excludes network I/O for
/// every opcode except REPLAY (`async` since `ReplayHistoryUseCase` can
/// involve a real Redis round-trip when durable history is enabled — see
/// that use case's own doc comment) — a deliberate, documented exception,
/// not a drift from the original rule.
pub async fn execute(
    ctx: &RealtimeContext,
    session_id: SessionId,
    authenticated_tenant: &mut Option<TenantId>,
    frame: &Frame<'_>,
) -> FrameCommand {
    let started_at = Instant::now();
    let opcode = frame.opcode();

    let command = execute_inner(ctx, session_id, authenticated_tenant, frame).await;

    ctx.metrics.record_frame(frame.tenant_id(), opcode.label(), started_at.elapsed());

    command
}

async fn execute_inner(
    ctx: &RealtimeContext,
    session_id: SessionId,
    authenticated_tenant: &mut Option<TenantId>,
    frame: &Frame<'_>,
) -> FrameCommand {
    match frame.opcode() {
        Opcode::Auth => match AuthenticateSessionUseCase::execute(ctx, session_id, frame) {
            AuthOutcome::Authenticated { tenant_id, command } => {
                *authenticated_tenant = Some(tenant_id);
                command
            }
            AuthOutcome::Rejected => FrameCommand::CloseAuthFailed,
        },
        Opcode::Ping => HeartbeatUseCase::execute(ctx, session_id, *authenticated_tenant),
        Opcode::Subscribe => SubscribeChannelUseCase::execute(ctx, session_id, *authenticated_tenant, frame),
        Opcode::Unsub => UnsubscribeChannelUseCase::execute(ctx, session_id, *authenticated_tenant, frame),
        Opcode::Publish => PublishMessageUseCase::execute(ctx, session_id, *authenticated_tenant, frame),
        Opcode::Unicast => UnicastMessageUseCase::execute(ctx, session_id, *authenticated_tenant, frame),
        Opcode::Replay => ReplayHistoryUseCase::execute(ctx, session_id, *authenticated_tenant, frame).await,
        Opcode::Message | Opcode::Presence => FrameCommand::None, // server -> client only opcodes
    }
}
