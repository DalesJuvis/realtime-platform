//! # PublishMessageDto
//!
//! **Action:** Request/response bodies for `POST /api/v1/messages` — the
//! HTTP publish path, an alternative to opening a WS/TCP connection just
//! to send one PUB frame (e.g. a backend job notifying a channel).
//! Authentication is a bearer client token (`Authorization: Bearer <token>`),
//! the same kind issued by `POST /api/v1/auth/tokens` — never the raw
//! tenant secret.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct PublishMessageDto {
    pub tenant_id: Uuid,
    pub channel_id: String,
    pub payload: String,
}

#[derive(Serialize)]
pub struct PublishMessageResponseDto {
    pub published: bool,
}
