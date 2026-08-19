//! # main
//!
//! **Action:** Composition root — wires every layer together and starts
//! the WebSocket server (Axum), the raw TCP server, and the Admin REST API,
//! all sharing the same domain services, with clean shutdown on SIGINT/SIGTERM.
//! **Input:** Environment variables (via `settings::Settings`).
//! **Output:** Three running network listeners.
//! **Side effects:** Binds sockets; spawns background tasks (heartbeat sweep, push worker, cluster bus).
//! **Dependencies:** Every `modules::*` domain.
//!
//! This file is intentionally the one place allowed to just wire things
//! together procedurally — per BACKEND.md's own examples, `main()` is the
//! composition root, not part of the Controller→UseCase→Service→Repository
//! pipeline it assembles.
//!
//! `#![allow(non_snake_case)]`: this codebase follows BACKEND.md's
//! cross-language naming convention (`{Action}{Resource}Controller.rs`,
//! `{Resource}Service.rs`, ...) for module file names, which reads as
//! PascalCase to `rustc`'s default module-name lint. The convention is a
//! deliberate, explicit choice (see BACKEND.md §4), not an oversight.
#![allow(non_snake_case)]

mod entities;
mod modules;
mod settings;

use std::sync::Arc;

use axum::routing::get;
use axum::Router;
use tokio::net::TcpListener;
use uuid::Uuid;

use modules::admin::AdminContext::AdminContext;
use modules::auth::services::TokenService::TokenService;
use modules::cluster::adapters::RedisClusterAdapter::RedisClusterAdapter;
use modules::cluster::ports::ClusterBroadcastPort::ClusterBroadcastPort;
use modules::metrics::services::MetricsService::MetricsService;
use modules::push::adapters::FcmPushAdapter::{FcmConfig, FcmPushAdapter};
use modules::push::ports::PushPort::PushPort;
use modules::rate_limit::services::RateLimitService::RateLimitService;
use modules::realtime::controllers::{TcpController, WsController};
use modules::realtime::services::ChannelRouterService::ChannelRouterService;
use modules::realtime::services::PresenceService::PresenceService;
use modules::realtime::services::PushFallbackService::PushFallbackService;
use modules::realtime::RealtimeContext::RealtimeContext;
use settings::Settings;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let settings = Settings::from_env();

    // --- Core domain services --------------------------------------------------
    let auth = Arc::new(TokenService::new());
    if let Some(secret) = &settings.demo_tenant_secret {
        auth.register_tenant(Uuid::from_u128(1), secret.clone().into_bytes());
    }

    let channel_router = Arc::new(ChannelRouterService::new());
    let presence = PresenceService::new(settings.presence_timeout, channel_router.clone());
    let rate_limiter = Arc::new(RateLimitService::new(Default::default()));
    let metrics = MetricsService::new();

    let push: Arc<dyn PushPort> = FcmPushAdapter::spawn(FcmConfig {
        project_id: settings.fcm_project_id.clone(),
        bearer_token: settings.fcm_bearer_token.clone(),
    });

    // Multi-instance broadcast: optional, enabled only if REDIS_URL is
    // set. Without it, the service runs single-instance, unchanged.
    let cluster: Option<Arc<dyn ClusterBroadcastPort>> = match &settings.redis_url {
        Some(url) => match RedisClusterAdapter::connect(url, channel_router.clone()).await {
            Ok(bus) => {
                tracing::info!(instance_id = %bus.instance_id(), %url, "connected to the Redis cluster bus");
                Some(bus)
            }
            Err(err) => {
                tracing::error!(error = %err, %url, "Redis cluster bus connection failed, starting single-instance");
                None
            }
        },
        None => {
            tracing::info!("REDIS_URL not set: single-instance mode (no inter-instance broadcast)");
            None
        }
    };

    let push_fallback = PushFallbackService::new(channel_router.clone(), push, cluster, metrics.clone());

    let realtime_ctx = RealtimeContext {
        auth: auth.clone(),
        channel_router: channel_router.clone(),
        presence: presence.clone(),
        push_fallback,
        rate_limiter: rate_limiter.clone(),
        metrics: metrics.clone(),
    };

    // --- Admin API ---------------------------------------------------------
    // Admin token: provide via ADMIN_API_TOKEN in production (secret
    // manager / orchestrator-injected env var). Otherwise a random one is
    // generated and logged once at startup — convenient in dev, never
    // leave it like this in production (the token wouldn't survive a restart anyway).
    let admin_token = settings.admin_api_token.clone().unwrap_or_else(|| {
        let generated = Uuid::new_v4().to_string();
        tracing::warn!(
            token = %generated,
            "ADMIN_API_TOKEN not set: temporary admin token generated (fix this before production)"
        );
        generated
    });
    let admin_ctx = AdminContext {
        auth,
        rate_limiter,
        admin_token: Arc::new(admin_token),
        metrics,
    };
    let admin_listener = TcpListener::bind(settings.admin_bind_addr)
        .await
        .unwrap_or_else(|e| panic!("cannot bind Admin API on {}: {e}", settings.admin_bind_addr));
    tracing::info!(
        "Admin API listening on {} (internal network only, never expose publicly)",
        settings.admin_bind_addr
    );
    let admin_server = tokio::spawn(async move {
        axum::serve(admin_listener, modules::admin::routes::router(admin_ctx))
            .with_graceful_shutdown(shutdown_signal())
            .await
            .expect("fatal Admin API error");
    });

    // Background heartbeat/presence sweep loop (constraint #3).
    let sweeper = presence.spawn_heartbeat_loop(settings.presence_sweep_interval);

    // --- WebSocket server ----------------------------------------------------
    let ws_app = Router::new()
        .route("/ws", get(WsController::upgrade))
        .with_state(realtime_ctx.clone());
    let ws_listener = TcpListener::bind(settings.ws_bind_addr)
        .await
        .unwrap_or_else(|e| panic!("cannot bind WebSocket on {}: {e}", settings.ws_bind_addr));
    tracing::info!("WebSocket server listening on {}", settings.ws_bind_addr);
    let ws_server = tokio::spawn(async move {
        axum::serve(ws_listener, ws_app)
            .with_graceful_shutdown(shutdown_signal())
            .await
            .expect("fatal WebSocket server error");
    });

    // --- Raw TCP server --------------------------------------------------------
    let tcp_listener = TcpListener::bind(settings.tcp_bind_addr)
        .await
        .unwrap_or_else(|e| panic!("cannot bind TCP on {}: {e}", settings.tcp_bind_addr));
    tracing::info!("TCP server listening on {}", settings.tcp_bind_addr);
    let tcp_ctx = realtime_ctx.clone();
    let tcp_server = tokio::spawn(async move {
        loop {
            tokio::select! {
                accepted = tcp_listener.accept() => {
                    match accepted {
                        Ok((socket, addr)) => {
                            let ctx = tcp_ctx.clone();
                            tokio::spawn(async move {
                                if let Err(err) = TcpController::handle_connection(socket, ctx).await {
                                    tracing::debug!(%addr, error = %err, "TCP connection closed with error");
                                }
                            });
                        }
                        Err(err) => tracing::warn!(error = %err, "TCP accept failed"),
                    }
                }
                _ = shutdown_signal() => break,
            }
        }
    });

    let _ = tokio::join!(ws_server, tcp_server, admin_server);
    sweeper.abort();
    tracing::info!("shutdown complete");
}

/// Waits for SIGINT (Ctrl+C, local) or SIGTERM (Docker/Kubernetes stop
/// signal) to trigger a clean shutdown rather than a hard kill of active connections.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
    tracing::info!("shutdown signal received, closing cleanly");
}
