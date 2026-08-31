//! # PortalContext
//!
//! **Action:** Dependency-injection context for the Portal REST API —
//! separate from `AdminContext` (different credential space, different
//! guard). Originally never touched a live frame; now also backs the
//! Broadcasting/Channel Management pages, so it carries the same publish
//! path (`channel_router`, `push_fallback`, `rate_limiter`) as
//! `RealtimeContext` — reused by reference from it in `main.rs`, not
//! duplicated construction.
//! **Side effects:** None — a plain `Arc` bundle, cheap to `Clone`.
//! **Dependencies:** `services::TokenService`, `services::PresenceService`,
//! `services::MetricsService`, `services::{ChannelRouterService, PushFallbackService}`,
//! `rate_limit::services::RateLimitService`, `portal::services::PortalAuthService`,
//! `portal::repositories::{TenantUserRepository, TenantSecretStoreRepository, MessageTemplateRepository}`.

use std::sync::Arc;

use crate::modules::auth::services::TokenService::TokenService;
use crate::modules::metrics::services::MetricsService::MetricsService;
use crate::modules::portal::repositories::ApiKeyRepository::ApiKeyRepository;
use crate::modules::portal::repositories::MessageTemplateRepository::MessageTemplateRepository;
use crate::modules::portal::repositories::TenantSecretStoreRepository::TenantSecretStoreRepository;
use crate::modules::portal::repositories::TenantUserRepository::TenantUserRepository;
use crate::modules::portal::repositories::WorkspaceProfileRepository::WorkspaceProfileRepository;
use crate::modules::portal::services::PortalAuthService::PortalAuthService;
use crate::modules::rate_limit::services::RateLimitService::RateLimitService;
use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;
use crate::modules::realtime::services::PresenceService::PresenceService;
use crate::modules::realtime::services::PushFallbackService::PushFallbackService;

#[derive(Clone)]
pub struct PortalContext {
    pub token_service: Arc<TokenService>,
    pub presence: Arc<PresenceService>,
    pub metrics: Arc<MetricsService>,
    pub portal_auth: Arc<PortalAuthService>,
    pub tenant_users: Arc<TenantUserRepository>,
    pub tenant_secrets: Arc<TenantSecretStoreRepository>,
    pub api_keys: Arc<ApiKeyRepository>,
    pub templates: Arc<MessageTemplateRepository>,
    pub workspace_profile: Arc<WorkspaceProfileRepository>,
    pub channel_router: Arc<ChannelRouterService>,
    pub push_fallback: Arc<PushFallbackService>,
    pub rate_limiter: Arc<RateLimitService>,
    /// `Settings::public_ws_url` — see `auth::services::WsUrlService`'s
    /// doc comment.
    pub public_ws_url: Option<Arc<str>>,
}
