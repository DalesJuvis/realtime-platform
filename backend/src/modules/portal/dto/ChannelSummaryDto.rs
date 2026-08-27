//! # ChannelSummaryDto
//!
//! **Action:** Response shape for `GET /api/v1/portal/channels` — the
//! Channel Management page's data. Channels are never a first-class
//! persisted entity in this system (see `ChannelStateRepository`'s doc
//! comment): a channel exists the moment something SUBs or PUBs on it,
//! and is pruned once it has no subscribers and no history. This DTO
//! reflects that live state honestly rather than simulating a channel
//! registry that doesn't exist server-side.

use serde::Serialize;

#[derive(Serialize)]
pub struct ChannelSummaryDto {
    pub channel_id: String,
    pub subscriber_count: usize,
}
