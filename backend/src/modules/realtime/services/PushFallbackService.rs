//! # PushFallbackService
//!
//! **Action:** Publishes a frame locally, fans it out across the cluster,
//! and falls back to push notification when nobody is listening locally.
//! **Input:** Session/tenant IDs, a `ChannelKey`, a parsed `Frame`.
//! **Output:** `FrameCommand` (always `None`, mirroring the dispatch contract).
//! **Side effects:** Publishes via `ChannelRouterService`; broadcasts via `ClusterBroadcastPort`; submits jobs via `PushPort`; records metrics.
//! **Dependencies:** `services::ChannelRouterService`, `push::ports::PushPort`, `cluster::ports::ClusterBroadcastPort`, `metrics::services::MetricsService`.
//!
//! Shared logic between PUB and UNICAST (the former `publish_and_fanout`
//! free function in `main.rs`): publish on `key` (explicit channel for
//! PUB, resolved private inbox for UNICAST), fan out to other cluster
//! instances, and fall back to push if nobody is attached locally.
//! Centralized so the two opcodes never drift out of sync.

use std::sync::Arc;

use crate::entities::ChannelKey::{ChannelKey, SessionId, TenantId};
use crate::entities::Frame::Frame;
use crate::modules::cluster::ports::ClusterBroadcastPort::ClusterBroadcastPort;
use crate::modules::push::dto::PushJob::build_push_job;
use crate::modules::push::ports::PushPort::PushPort;
use crate::modules::metrics::services::MetricsService::MetricsService;
use crate::modules::realtime::dto::FrameCommand::FrameCommand;
use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;

pub struct PushFallbackService {
    channel_router: Arc<ChannelRouterService>,
    push: Arc<dyn PushPort>,
    /// `None` in single-instance deployment (no `REDIS_URL` configured):
    /// the service then behaves exactly as before, with no Redis
    /// dependency. `Some` enables inter-instance fan-out.
    cluster: Option<Arc<dyn ClusterBroadcastPort>>,
    metrics: Arc<MetricsService>,
}

impl PushFallbackService {
    pub fn new(
        channel_router: Arc<ChannelRouterService>,
        push: Arc<dyn PushPort>,
        cluster: Option<Arc<dyn ClusterBroadcastPort>>,
        metrics: Arc<MetricsService>,
    ) -> Arc<Self> {
        Arc::new(Self {
            channel_router,
            push,
            cluster,
            metrics,
        })
    }

    pub fn publish_and_fanout(
        &self,
        session_id: SessionId,
        tenant_id: TenantId,
        key: &ChannelKey,
        frame: &Frame<'_>,
    ) -> FrameCommand {
        let raw = *frame.as_bytes();
        match self.channel_router.publish(tenant_id, key, raw) {
            Ok(local_subscribers) => {
                // Fan out to other cluster instances regardless of whether
                // this instance has local subscribers: another instance
                // might. See `RedisClusterAdapter`'s docs for the known
                // interaction with the push fallback below.
                if let Some(cluster) = &self.cluster {
                    cluster.broadcast(raw);
                }

                if local_subscribers == 0 {
                    // No active socket subscriber *locally*: push fallback
                    // (constraint #4). Resolving device tokens
                    // (tenant/channel -> FCM tokens) is an application
                    // concern to wire in here (DB/cache).
                    let job = build_push_job(tenant_id, &key.channel_id, frame.payload(), Vec::new());
                    self.push.submit(job);
                    self.metrics.record_push_fallback(tenant_id);
                }
                FrameCommand::None
            }
            Err(err) => {
                tracing::debug!(%session_id, error = %err, "PUB/UNICAST rejected");
                FrameCommand::None
            }
        }
    }
}
