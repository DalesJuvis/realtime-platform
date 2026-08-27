//! # PublishMessageHttpUseCase
//!
//! **Action:** Publishes one message to a channel over HTTP, as the
//! `Opcode::Publish` counterpart of `PublishMessageUseCase` (the WS/TCP
//! frame path) — same fan-out (`PushFallbackService`), same tenant-secret
//! boundary (a valid client token, never the raw tenant secret), same
//! wire format underneath (a single 256-byte frame is still built and
//! parsed; this is the HTTP origination of a PUB, not a second protocol).
//! **Input:** `PublishMessageDto`, the bearer token from the
//! `Authorization` header.
//! **Output:** `Ok(())` on success, typed `PublishHttpError` otherwise.
//! **Side effects:** Publishes via `PushFallbackService`; records metrics.
//! **Dependencies:** `entities::Frame`, `auth::services::TokenService`,
//! `rate_limit::services::RateLimitService`, `realtime::RealtimeContext`.
//!
//! Deliberately out of scope: message chunking. The SDK's transparent
//! chunking (`sdk-typescript/src/chunking.ts`) is a client-side concern
//! layered on top of the WS/TCP frame stream; this endpoint accepts one
//! frame's worth of payload (211 UTF-8 bytes) and rejects anything larger
//! rather than silently truncating it — a caller with bigger messages
//! should chunk them into multiple calls itself, or use a connected SDK client.

use std::time::Instant;
use uuid::Uuid;

use crate::entities::ChannelKey::ChannelKey;
use crate::entities::Frame::{Frame, FrameBuilder, Opcode, FRAME_SIZE};
use crate::modules::auth::services::TokenService::AuthError;
use crate::modules::realtime::dto::PublishMessageDto::PublishMessageDto;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

/// Field widths mirrored from `entities::Frame` (private constants there,
/// so re-checked here rather than silently relying on `FrameBuilder`'s
/// truncate-at-boundary behavior, which would otherwise ship a shortened
/// message instead of telling the caller their request didn't fit).
const MAX_CHANNEL_ID_BYTES: usize = 24;
const MAX_PAYLOAD_BYTES: usize = 211;

#[derive(Debug, thiserror::Error)]
pub enum PublishHttpError {
    #[error("channel_id exceeds {MAX_CHANNEL_ID_BYTES} bytes")]
    ChannelIdTooLong,
    #[error(
        "payload exceeds {MAX_PAYLOAD_BYTES} bytes — HTTP publish does not support chunking, \
         split it into multiple requests or use a connected SDK client instead"
    )]
    PayloadTooLarge,
    #[error(transparent)]
    Unauthorized(#[from] AuthError),
    #[error("rate limit exceeded for this tenant")]
    RateLimited,
}

pub fn execute(ctx: &RealtimeContext, dto: PublishMessageDto, token: &str) -> Result<(), PublishHttpError> {
    if dto.channel_id.len() > MAX_CHANNEL_ID_BYTES {
        return Err(PublishHttpError::ChannelIdTooLong);
    }
    if dto.payload.len() > MAX_PAYLOAD_BYTES {
        return Err(PublishHttpError::PayloadTooLarge);
    }

    ctx.auth.validate(dto.tenant_id, token)?;

    if !ctx.rate_limiter.check_tenant(dto.tenant_id) {
        return Err(PublishHttpError::RateLimited);
    }

    let raw: [u8; FRAME_SIZE] = FrameBuilder::new(Opcode::Publish, dto.tenant_id)
        .channel_id(dto.channel_id.clone())
        .payload(dto.payload)
        .build();
    // Reparsing what we just built is cheap (no allocation) and keeps
    // `PushFallbackService` — shared with the WS/TCP path — working
    // against one `Frame` type rather than growing an HTTP-only variant.
    let frame = Frame::parse(&raw).expect("just-built frame is always well-formed");

    let key = ChannelKey::new(dto.tenant_id, dto.channel_id);
    // No persistent connection to key a session on: a fresh ID per
    // request is fine here since `publish_and_fanout` only uses it for
    // error-log correlation, never to look anything up.
    let pseudo_session_id = Uuid::new_v4();

    let started_at = Instant::now();
    ctx.push_fallback.publish_and_fanout(pseudo_session_id, dto.tenant_id, &key, &frame);
    ctx.metrics.record_frame(dto.tenant_id, Opcode::Publish.label(), started_at.elapsed());

    Ok(())
}
