//! # TcpController
//!
//! **Action:** Drives the per-connection frame read/write loop over a raw
//! TCP socket (no HTTP/WebSocket overhead).
//! **Input:** An accepted `TcpStream` carrying 256-byte frames.
//! **Output:** Frame relaying identical in behavior to `WsController`.
//! **Side effects:** Spawns per-subscription relay tasks; updates connection metrics and presence on connect/disconnect.
//! **Dependencies:** `usecases::DispatchFrameUseCase`, `RealtimeContext`.

use std::collections::HashMap;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::entities::ChannelKey::{SessionId, TenantId};
use crate::entities::Frame::{Frame, FrameBuilder, Opcode, FRAME_SIZE};
use crate::modules::metrics::services::MetricsService::Transport;
use crate::modules::realtime::dto::FrameCommand::FrameCommand;
use crate::modules::realtime::usecases::DispatchFrameUseCase;
use crate::modules::realtime::RealtimeContext::RealtimeContext;

const RELAY_BUFFER: usize = 256;

pub async fn handle_connection(socket: TcpStream, ctx: RealtimeContext) -> std::io::Result<()> {
    let (mut read_half, mut write_half) = socket.into_split();
    let session_id: SessionId = Uuid::new_v4();
    let mut authenticated_tenant: Option<TenantId> = None;
    ctx.metrics.connection_opened(Transport::Tcp);

    let (out_tx, mut out_rx) = mpsc::channel::<[u8; FRAME_SIZE]>(RELAY_BUFFER);
    let mut relay_tasks: HashMap<String, tokio::task::JoinHandle<()>> = HashMap::new();

    loop {
        let mut buf = [0u8; FRAME_SIZE];
        tokio::select! {
            read_result = read_half.read_exact(&mut buf) => {
                if read_result.is_err() {
                    break; // socket closed or incomplete frame
                }
                let frame = match Frame::parse(&buf) {
                    Ok(f) => f,
                    Err(err) => {
                        tracing::debug!(%session_id, error = %err, "invalid TCP frame ignored");
                        continue;
                    }
                };

                if !ctx.rate_limiter.check(session_id, frame.tenant_id()) {
                    tracing::debug!(%session_id, "TCP frame rejected (rate limited)");
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
                    // No WS-style close code concept over raw TCP — the
                    // stream just closes. See WsController for the WS side,
                    // which does send one so browser/SDK clients can tell
                    // an auth failure apart from every other disconnect.
                    FrameCommand::CloseAuthFailed => break,
                    FrameCommand::None => {
                        // Echo an application-level PONG in reply to PING,
                        // so the TCP client can measure its RTT.
                        if frame.opcode() == Opcode::Ping && authenticated_tenant.is_some() {
                            let pong = FrameBuilder::new(Opcode::Ping, frame.tenant_id()).build();
                            if write_half.write_all(&pong).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            }

            Some(relayed) = out_rx.recv() => {
                if write_half.write_all(&relayed).await.is_err() {
                    break;
                }
            }
        }
    }

    for (_, task) in relay_tasks {
        task.abort();
    }
    ctx.rate_limiter.drop_session(session_id);
    ctx.metrics.connection_closed(Transport::Tcp);
    if authenticated_tenant.is_some() {
        ctx.presence.handle_leave(session_id);
    }

    Ok(())
}
