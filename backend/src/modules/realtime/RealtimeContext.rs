//! # RealtimeContext
//!
//! **Action:** Dependency-injection context for the realtime (WS/TCP)
//! domain, shared by every connection handler and use case.
//! **Input:** N/A (constructed once at bootstrap).
//! **Output:** N/A.
//! **Side effects:** None — a plain `Arc` bundle, cheap to `Clone`.
//! **Dependencies:** All realtime-domain services.

use std::sync::Arc;

use crate::modules::auth::services::TokenService::TokenService;
use crate::modules::metrics::services::MetricsService::MetricsService;
use crate::modules::rate_limit::services::RateLimitService::RateLimitService;
use crate::modules::realtime::repositories::PushSubscriptionRepository::PushSubscriptionRepository;
use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;
use crate::modules::realtime::services::PresenceService::PresenceService;
use crate::modules::realtime::services::PushFallbackService::PushFallbackService;

#[derive(Clone)]
pub struct RealtimeContext {
    pub auth: Arc<TokenService>,
    pub channel_router: Arc<ChannelRouterService>,
    pub presence: Arc<PresenceService>,
    pub push_fallback: Arc<PushFallbackService>,
    pub push_subscriptions: Arc<PushSubscriptionRepository>,
    pub rate_limiter: Arc<RateLimitService>,
    pub metrics: Arc<MetricsService>,
}
