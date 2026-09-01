//! # PublishTemplateHttpUseCase
//!
//! **Action:** Publishes one of the tenant's saved templates to a channel
//! over HTTP — the `template_id` counterpart of
//! `PublishMessageHttpUseCase`'s raw `payload`. Loads the template via
//! `MessageTemplateRepository` (scoped to the token's own `tenant_id`,
//! same non-leaking lookup `find_by_id` already uses for `update`/
//! `delete`), fills in `{{variable}}` placeholders with
//! `MessageTemplate::render`, then publishes exactly like the raw-payload
//! path — same frame, same fan-out, same tenant-secret boundary (a valid
//! client token, never the raw secret).
//! **Input:** `PublishTemplateDto`, the bearer token from the
//! `Authorization` header.
//! **Output:** `Ok(())` on success, typed `PublishTemplateError` otherwise.
//! **Side effects:** Reads the template row; publishes via
//! `PushFallbackService`; records metrics.
//! **Dependencies:** `entities::{Frame, MessageTemplate}`,
//! `auth::services::TokenService`,
//! `portal::repositories::MessageTemplateRepository`,
//! `rate_limit::services::RateLimitService`, `realtime::RealtimeContext`.

use std::time::Instant;
use uuid::Uuid;

use crate::entities::ChannelKey::ChannelKey;
use crate::entities::Frame::{Frame, FrameBuilder, Opcode, FRAME_SIZE};
use crate::modules::auth::services::TokenService::AuthError;
use crate::modules::realtime::dto::PublishTemplateDto::PublishTemplateDto;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

const MAX_CHANNEL_ID_BYTES: usize = 24;
const MAX_PAYLOAD_BYTES: usize = 211;

#[derive(Debug, thiserror::Error)]
pub enum PublishTemplateError {
    #[error("channel_id exceeds {MAX_CHANNEL_ID_BYTES} bytes")]
    ChannelIdTooLong,
    #[error(
        "rendered template exceeds {MAX_PAYLOAD_BYTES} bytes — shorten the template or the \
         supplied variable values"
    )]
    PayloadTooLarge,
    #[error(transparent)]
    Unauthorized(#[from] AuthError),
    #[error("template not found")]
    TemplateNotFound,
    #[error("rate limit exceeded for this tenant")]
    RateLimited,
    #[error("storage error")]
    Storage(#[from] sqlx::Error),
}

pub async fn execute(
    ctx: &RealtimeContext,
    dto: PublishTemplateDto,
    token: &str,
) -> Result<(), PublishTemplateError> {
    if dto.channel_id.len() > MAX_CHANNEL_ID_BYTES {
        return Err(PublishTemplateError::ChannelIdTooLong);
    }

    ctx.auth.validate(dto.tenant_id, token)?;

    if !ctx.rate_limiter.check_tenant(dto.tenant_id) {
        return Err(PublishTemplateError::RateLimited);
    }

    let template = ctx
        .templates
        .find_by_id(dto.tenant_id, dto.template_id)
        .await?
        .ok_or(PublishTemplateError::TemplateNotFound)?;

    let payload = template.render(&dto.variables);
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(PublishTemplateError::PayloadTooLarge);
    }

    let raw: [u8; FRAME_SIZE] = FrameBuilder::new(Opcode::Publish, dto.tenant_id)
        .channel_id(dto.channel_id.clone())
        .payload(payload)
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
