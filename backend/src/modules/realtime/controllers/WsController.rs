//! # WsController
//!
//! **Action:** Upgrades an HTTP connection to WebSocket and drives the
//! per-connection frame read/write loop.
//! **Input:** `GET /ws` WebSocket upgrade request.
//! **Output:** A live WebSocket relaying binary 256-byte frames.
//! **Side effects:** Spawns per-subscription relay tasks; updates connection metrics and presence on connect/disconnect.
//! **Dependencies:** `usecases::DispatchFrameUseCase`, `RealtimeContext`.
//!
//! Transport-only: parses/writes raw WebSocket binary messages and turns
//! `FrameCommand`s into socket actions. All business logic lives in
//! `DispatchFrameUseCase` and the opcode use cases it delegates to.

use std::collections::HashMap;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::entities::ChannelKey::{SessionId, TenantId};
use crate::entities::Frame::{Frame, FRAME_SIZE};
use crate::modules::metrics::services::MetricsService::Transport;
use crate::modules::realtime::dto::FrameCommand::FrameCommand;
use crate::modules::realtime::usecases::DispatchFrameUseCase;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

const RELAY_BUFFER: usize = 256;

/// Sent as the WS close code when AUTH is rejected (bad signature or an
/// expired token) — 4001, in the app-defined 4000-4999 range RFC 6455
/// reserves for exactly this. Lets every client distinguish "your token
/// is no good, mint a fresh one" from every other disconnect reason
/// (network drop, server restart, client-initiated close), all of which
/// previously collapsed into the same code-less, reason-less socket drop.
const WS_CLOSE_CODE_AUTH_FAILED: u16 = 4001;

pub async fn upgrade(ws: WebSocketUpgrade, State(ctx): State<RealtimeContext>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_connection(socket, ctx))
}

async fn handle_connection(socket: WebSocket, ctx: RealtimeContext) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let session_id: SessionId = Uuid::new_v4();
    let mut authenticated_tenant: Option<TenantId> = None;
    ctx.metrics.connection_opened(Transport::WebSocket);

    // Aggregates messages from every channel this session subscribes to,
    // relayed without blocking the inbound command loop on the same socket.
    let (out_tx, mut out_rx) = mpsc::channel::<[u8; FRAME_SIZE]>(RELAY_BUFFER);
    // Indexed by channel/pattern key (rather than a plain Vec) so an UNSUB
    // can target and `abort()` precisely the right relay task, without
    // affecting the socket's other active subscriptions.
    let mut relay_tasks: HashMap<String, tokio::task::JoinHandle<()>> = HashMap::new();

    loop {
        tokio::select! {
            incoming = ws_rx.next() => {
                let Some(Ok(msg)) = incoming else { break };
                let bytes = match msg {
                    Message::Binary(b) => b,
                    Message::Close(_) => break,
                    _ => continue, // 100% binary 256B protocol: Text/Ping/Pong ignored
                };
                let frame = match Frame::parse_slice(&bytes) {
                    Ok(f) => f,
                    Err(err) => {
                        tracing::debug!(%session_id, error = %err, "invalid WS frame ignored");
                        continue;
                    }
                };

                // Anti-abuse: checked before any business logic, including
                // before AUTH, so a flood never consumes CPU beyond parsing.
                if !ctx.rate_limiter.check(session_id, frame.tenant_id()) {
                    tracing::debug!(%session_id, "WS frame rejected (rate limited)");
                    ctx.metrics.record_rate_limited(frame.tenant_id());
                    continue;
                }

                match DispatchFrameUseCase::execute(&ctx, session_id, &mut authenticated_tenant, &frame).await {
                    FrameCommand::Subscribed(key, mut rx) => {
                        let out_tx = out_tx.clone();
                        let handle = tokio::spawn(async move {
                            while let Ok(relayed) = rx.recv().await {
                                if out_tx.send(relayed).await.is_err() {
                                    break;
                                }
                            }
                        });
                        // A re-SUB on an already-active key replaces the
                        // previous task rather than accumulating a second
                        // one that would relay the same messages twice.
                        if let Some(old) = relay_tasks.insert(key, handle) {
                            old.abort();
                        }
                    }
                    FrameCommand::Unsubscribed(key) => {
                        if let Some(handle) = relay_tasks.remove(&key) {
                            handle.abort();
                        }
                    }
                    FrameCommand::Replayed(frames) => {
                        for f in frames {
                            if out_tx.send(f).await.is_err() {
                                break;
                            }
                        }
                    }
                    FrameCommand::CloseAuthFailed => {
                        // Best-effort: if the send fails, the socket is
                        // already gone, which is exactly the state we want.
                        let _ = ws_tx
                            .send(Message::Close(Some(CloseFrame {
                                code: WS_CLOSE_CODE_AUTH_FAILED,
                                reason: "authentication failed".into(),
                            })))
                            .await;
                        break;
                    }
                    FrameCommand::None => {}
                }
            }

            Some(relayed) = out_rx.recv() => {
                if ws_tx.send(Message::Binary(relayed.to_vec())).await.is_err() {
                    break;
                }
            }
        }
    }

    for (_, task) in relay_tasks {
        task.abort();
    }
    ctx.rate_limiter.drop_session(session_id);
    ctx.metrics.connection_closed(Transport::WebSocket);
    if authenticated_tenant.is_some() {
        ctx.presence.handle_leave(session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use std::sync::Arc;

    use axum::routing::get;
    use axum::Router as AxumRouter;
    use tokio::net::TcpListener;
    use tokio_tungstenite::tungstenite::Message as TtMessage;
    use uuid::Uuid;

    use crate::entities::Frame::{FrameBuilder, Opcode};
    use crate::entities::RateLimitConfig::RateLimitConfig;
    use crate::modules::auth::services::TokenService::TokenService;
    use crate::modules::metrics::services::MetricsService::MetricsService;
    use crate::modules::push::adapters::FcmPushAdapter::{FcmConfig, FcmPushAdapter};
    use crate::modules::push::ports::PushPort::PushPort;
    use crate::modules::rate_limit::services::RateLimitService::RateLimitService;
    use crate::modules::realtime::repositories::PushSubscriptionRepository::PushSubscriptionRepository;
    use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;
    use crate::modules::realtime::services::PresenceService::PresenceService;
    use crate::modules::realtime::services::PushFallbackService::PushFallbackService;

    async fn test_ctx() -> RealtimeContext {
        let auth = Arc::new(TokenService::new());
        let channel_router = Arc::new(ChannelRouterService::new());
        let presence = PresenceService::new(std::time::Duration::from_secs(30), channel_router.clone());
        let rate_limiter = Arc::new(RateLimitService::new(RateLimitConfig::default()));
        let metrics = MetricsService::new();
        // No real network call happens: `target_tokens` is always empty for
        // this DTO path, so `PushFallbackService::submit()` drops silently.
        let push: Arc<dyn PushPort> = FcmPushAdapter::spawn(FcmConfig {
            project_id: "test".to_string(),
            bearer_token: "test".to_string(),
        });
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let push_subscriptions = Arc::new(PushSubscriptionRepository::new(pool));
        let push_fallback =
            PushFallbackService::new(channel_router.clone(), push, None, push_subscriptions.clone(), None, metrics.clone());

        RealtimeContext { auth, channel_router, presence, push_fallback, push_subscriptions, rate_limiter, metrics }
    }

    /// The one behavior this whole change exists for: a real WS client
    /// sending a bad AUTH frame gets a real close frame back, carrying a
    /// distinct, documented code — not just a dropped connection
    /// indistinguishable from a network blip or a server restart.
    #[tokio::test]
    async fn sends_a_distinct_close_code_when_auth_is_rejected() {
        let ctx = test_ctx().await;
        let app = AxumRouter::new().route("/ws", get(upgrade)).with_state(ctx);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/ws")).await.unwrap();

        // Never-registered tenant — TokenService::validate rejects it the
        // same way it would an expired token (both collapse into the same
        // AuthOutcome::Rejected, by design — see FrameCommand's doc comment).
        let bad_frame = FrameBuilder::new(Opcode::Auth, Uuid::new_v4()).payload("not-a-real-token").build();
        ws.send(TtMessage::Binary(bad_frame.to_vec())).await.unwrap();

        let received = ws.next().await.expect("connection closed without a message").unwrap();
        match received {
            TtMessage::Close(Some(frame)) => {
                assert_eq!(u16::from(frame.code), WS_CLOSE_CODE_AUTH_FAILED);
                assert_eq!(frame.reason.as_ref(), "authentication failed");
            }
            other => panic!("expected a WS close frame with code {WS_CLOSE_CODE_AUTH_FAILED}, got {other:?}"),
        }
    }

    /// The literal scenario reported live: a token that *was* validly
    /// minted, just past its own `ttl_secs` — not a garbage/wrong-tenant
    /// token like the test above. Same close code either way (see
    /// `FrameCommand::CloseAuthFailed`'s own doc comment on why the two
    /// aren't distinguished past `TokenService::validate`).
    #[tokio::test]
    async fn sends_the_same_close_code_for_a_genuinely_expired_token() {
        let ctx = test_ctx().await;
        let tenant = Uuid::new_v4();
        ctx.auth.register_tenant(tenant, b"secret".to_vec());
        // ttl_secs: 0 -> exp = now; sleeping past the current second below
        // guarantees `validate` sees it as already expired, not a same-tick race.
        let token = ctx.auth.issue_token(tenant, "user-1", 0).unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await;

        let app = AxumRouter::new().route("/ws", get(upgrade)).with_state(ctx);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/ws")).await.unwrap();
        let frame = FrameBuilder::new(Opcode::Auth, tenant).payload(token).build();
        ws.send(TtMessage::Binary(frame.to_vec())).await.unwrap();

        let received = ws.next().await.expect("connection closed without a message").unwrap();
        match received {
            TtMessage::Close(Some(close)) => assert_eq!(u16::from(close.code), WS_CLOSE_CODE_AUTH_FAILED),
            other => panic!("expected a WS close frame with code {WS_CLOSE_CODE_AUTH_FAILED}, got {other:?}"),
        }
    }
}
