//! # AdminContext
//!
//! **Action:** Dependency-injection context for the Admin REST API,
//! deliberately separate from `RealtimeContext` — this API needs neither
//! the push dispatcher nor channel state. Does carry `presence` (read-only
//! live-session visibility for the Sandbox page) — a lighter dependency
//! than the full push/channel-routing stack.
//! **Input:** N/A (constructed once at bootstrap).
//! **Output:** N/A.
//! **Side effects:** None — a plain `Arc` bundle, cheap to `Clone`.
//! **Dependencies:** `services::TokenService`, `services::RateLimitService`,
//! `services::MetricsService`, `services::PresenceService`.

use std::sync::Arc;

use crate::modules::auth::services::TokenService::TokenService;
use crate::modules::metrics::services::MetricsService::MetricsService;
use crate::modules::rate_limit::services::RateLimitService::RateLimitService;
use crate::modules::realtime::services::PresenceService::PresenceService;

#[derive(Clone)]
pub struct AdminContext {
    pub auth: Arc<TokenService>,
    pub rate_limiter: Arc<RateLimitService>,
    pub admin_token: Arc<String>,
    pub metrics: Arc<MetricsService>,
    pub presence: Arc<PresenceService>,
}
