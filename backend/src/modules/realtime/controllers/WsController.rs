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

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
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

                match DispatchFrameUseCase::execute(&ctx, session_id, &mut authenticated_tenant, &frame) {
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
                    FrameCommand::Close => break,
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
