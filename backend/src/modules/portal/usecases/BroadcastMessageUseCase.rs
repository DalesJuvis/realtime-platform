//! # BroadcastMessageUseCase
//!
//! **Action:** The Broadcasting page's send action — publishes a message
//! to a channel of the caller's own tenant. Same underlying publish path
//! as `realtime::usecases::PublishMessageHttpUseCase` (build a frame,
//! delegate to `PushFallbackService`), but authenticated by the already-
//! validated portal session instead of a separate client token: the
//! portal session already proves tenant ownership at least as strongly as
//! a minted token would, so there is no reason to make the tenant's own
//! dashboard mint-then-publish in two round trips.
//! **Input:** `TenantId` (from the validated portal session), `BroadcastDto`.
//! **Output:** `BroadcastResponseDto`.
//! **Side effects:** Publishes via `PushFallbackService`; records metrics.
//! **Dependencies:** `entities::Frame`, `services::{ChannelRouterService,
//! PushFallbackService, RateLimitService, MetricsService}`.
//!
//! Same scope boundary as the HTTP publish endpoint: one frame's worth of
//! payload (211 UTF-8 bytes), no chunking — a broadcast that doesn't fit
//! must be split into multiple sends.

use std::time::Instant;
use uuid::Uuid;

use crate::entities::ChannelKey::{ChannelKey, TenantId};
use crate::entities::Frame::{Frame, FrameBuilder, Opcode, FRAME_SIZE};
use crate::modules::portal::dto::BroadcastDto::{BroadcastDto, BroadcastResponseDto};
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

const MAX_CHANNEL_ID_BYTES: usize = 24;
const MAX_PAYLOAD_BYTES: usize = 211;

pub fn execute(ctx: &PortalContext, tenant_id: TenantId, dto: BroadcastDto) -> Result<BroadcastResponseDto, PortalError> {
    if dto.channel_id.len() > MAX_CHANNEL_ID_BYTES {
        return Err(PortalError::ChannelIdTooLong);
    }
    if dto.payload.len() > MAX_PAYLOAD_BYTES {
        return Err(PortalError::PayloadTooLarge);
    }
    if !ctx.rate_limiter.check_tenant(tenant_id) {
        return Err(PortalError::RateLimited);
    }

    let raw: [u8; FRAME_SIZE] = FrameBuilder::new(Opcode::Publish, tenant_id)
        .channel_id(dto.channel_id.clone())
        .payload(dto.payload)
        .build();
    let frame = Frame::parse(&raw).expect("just-built frame is always well-formed");

    let key = ChannelKey::new(tenant_id, dto.channel_id);
    let pseudo_session_id = Uuid::new_v4();

    let started_at = Instant::now();
    ctx.push_fallback.publish_and_fanout(pseudo_session_id, tenant_id, &key, &frame);
    ctx.metrics.record_frame(tenant_id, Opcode::Publish.label(), started_at.elapsed());

    tracing::info!(%tenant_id, channel_id = %key.channel_id, "message broadcast via the portal");
    Ok(BroadcastResponseDto { published: true })
}
