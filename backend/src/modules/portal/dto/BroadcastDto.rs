//! # BroadcastDto
//!
//! **Action:** Request/response bodies for `POST /api/v1/portal/broadcast`
//! — the Broadcasting page's send action. Publishes through the caller's
//! already-proven portal session (no separate client-token mint/validate
//! round trip needed, unlike the public `POST /api/v1/messages` endpoint —
//! see that route's doc comment for the token-based path meant for a
//! tenant's own backend).

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct BroadcastDto {
    pub channel_id: String,
    pub payload: String,
}

#[derive(Serialize)]
pub struct BroadcastResponseDto {
    pub published: bool,
}
