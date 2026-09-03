//! # PushFallbackService
//!
//! **Action:** Publishes a frame locally, fans it out across the cluster,
//! records it in the tenant's notification log, and falls back to push
//! notification when nobody is listening locally — both FCM/mobile
//! (`PushPort`) and browser Web Push (`WebPushPort`). Also exposes
//! `send_test`, a direct one-subscription send used by the tenant-portal
//! device list's "send test notification" button — the one place this
//! service targets a device by identity instead of by channel.
//! **Input:** Session/tenant IDs, a `ChannelKey`, a parsed `Frame`.
//! **Output:** `FrameCommand` (always `None`, mirroring the dispatch contract).
//! **Side effects:** Publishes via `ChannelRouterService`; broadcasts via
//! `ClusterBroadcastPort`; submits jobs via `PushPort`/`WebPushPort`;
//! queries `PushSubscriptionRepository`; writes `NotificationRepository`;
//! records metrics.
//! **Dependencies:** `services::ChannelRouterService`, `push::ports::PushPort`,
//! `push::ports::WebPushPort`, `repositories::PushSubscriptionRepository`,
//! `portal::repositories::NotificationRepository`,
//! `cluster::ports::ClusterBroadcastPort`, `metrics::services::MetricsService`.
//!
//! Shared logic between PUB and UNICAST (the former `publish_and_fanout`
//! free function in `main.rs`): publish on `key` (explicit channel for
//! PUB, resolved private inbox for UNICAST), fan out to other cluster
//! instances, and fall back to push if nobody is attached locally.
//! Centralized so the two opcodes never drift out of sync.
//!
//! **Known caveat, inherited by Web Push too:** `local_subscribers == 0`
//! is per-*instance*, not cluster-wide — in a multi-instance deployment, a
//! client connected to a *different* instance still triggers this
//! instance's push fallback (both FCM and Web Push), a spurious
//! notification alongside the real delivery on the other instance. This
//! was already true of the FCM fallback before Web Push existed (see
//! `RedisClusterAdapter`'s docs) — not solved here, just not made worse.

use std::sync::Arc;

use crate::entities::ChannelKey::{ChannelKey, SessionId, TenantId};
use crate::entities::Frame::Frame;
use crate::modules::cluster::ports::ClusterBroadcastPort::ClusterBroadcastPort;
use crate::modules::metrics::services::MetricsService::MetricsService;
use crate::modules::portal::repositories::NotificationRepository::NotificationRepository;
use crate::modules::push::dto::PushJob::build_push_job;
use crate::modules::push::dto::WebPushJob::build_web_push_job;
use crate::modules::push::dto::WebPushSubscription::WebPushSubscription;
use crate::modules::push::ports::PushPort::PushPort;
use crate::modules::push::ports::WebPushPort::WebPushPort;
use crate::modules::realtime::dto::FrameCommand::FrameCommand;
use crate::modules::realtime::repositories::PushSubscriptionRepository::PushSubscriptionRepository;
use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;

pub struct PushFallbackService {
    channel_router: Arc<ChannelRouterService>,
    push: Arc<dyn PushPort>,
    /// `None` when `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` aren't
    /// configured: Web Push is then simply not attempted (no queries
    /// against `push_subscriptions` either — see `publish_and_fanout`),
    /// same "absent capability" pattern as `cluster` below.
    web_push: Option<Arc<dyn WebPushPort>>,
    push_subscriptions: Arc<PushSubscriptionRepository>,
    /// `None` in single-instance deployment (no `REDIS_URL` configured):
    /// the service then behaves exactly as before, with no Redis
    /// dependency. `Some` enables inter-instance fan-out.
    cluster: Option<Arc<dyn ClusterBroadcastPort>>,
    metrics: Arc<MetricsService>,
    /// Every successfully published message is durably recorded here
    /// (see the doc comment on the insert below), independent of whether
    /// push fallback fires — the tenant-portal notification bell's feed.
    notifications: Arc<NotificationRepository>,
}

impl PushFallbackService {
    pub fn new(
        channel_router: Arc<ChannelRouterService>,
        push: Arc<dyn PushPort>,
        web_push: Option<Arc<dyn WebPushPort>>,
        push_subscriptions: Arc<PushSubscriptionRepository>,
        cluster: Option<Arc<dyn ClusterBroadcastPort>>,
        metrics: Arc<MetricsService>,
        notifications: Arc<NotificationRepository>,
    ) -> Arc<Self> {
        Arc::new(Self {
            channel_router,
            push,
            web_push,
            push_subscriptions,
            cluster,
            metrics,
            notifications,
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

                // Recorded for every publish, not gated on
                // `local_subscribers == 0` like the push fallback below —
                // this is the notification bell's full received-message
                // log, not just a "you were away" inbox. Spawned for the
                // same non-blocking reason as the Web Push lookup below:
                // `NotificationRepository` is async (sqlx), and this
                // function must stay synchronous for the WS/TCP frame loop.
                {
                    let notifications = self.notifications.clone();
                    let channel_id = key.channel_id.clone();
                    let payload = frame.payload().to_string();
                    tokio::spawn(async move {
                        if let Err(err) = notifications.insert(tenant_id, &channel_id, &payload).await {
                            tracing::warn!(%tenant_id, %channel_id, error = %err, "failed to persist notification");
                        }
                    });
                }

                if local_subscribers == 0 {
                    // No active socket subscriber *locally*: push fallback
                    // (constraint #4). Resolving device tokens
                    // (tenant/channel -> FCM tokens) is an application
                    // concern to wire in here (DB/cache).
                    let job = build_push_job(tenant_id, &key.channel_id, frame.payload(), Vec::new());
                    self.push.submit(job);

                    // Web Push subscriptions are looked up in a spawned
                    // task rather than inline: `PushSubscriptionRepository`
                    // is async (sqlx), and this function must stay
                    // synchronous and non-blocking for the WS/TCP frame
                    // loop that also calls it — same "never slow down the
                    // hot path" rule `PushPort`/`WebPushPort` already
                    // apply to the network send itself, extended to cover
                    // the DB lookup that decides *whether* to send.
                    if let Some(web_push) = self.web_push.clone() {
                        let push_subscriptions = self.push_subscriptions.clone();
                        let channel_id = key.channel_id.clone();
                        let payload = frame.payload().to_string();
                        tokio::spawn(async move {
                            match push_subscriptions.find_matching(tenant_id, &channel_id).await {
                                Ok(subs) if !subs.is_empty() => {
                                    let subscriptions = subs
                                        .into_iter()
                                        .map(|s| WebPushSubscription {
                                            endpoint: s.endpoint,
                                            p256dh_key: s.p256dh_key,
                                            auth_key: s.auth_key,
                                        })
                                        .collect();
                                    web_push.submit(build_web_push_job(tenant_id, &channel_id, &payload, subscriptions));
                                }
                                Ok(_) => {}
                                Err(err) => {
                                    tracing::warn!(%tenant_id, %channel_id, error = %err, "failed to look up push subscriptions");
                                }
                            }
                        });
                    }

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

    /// Sends one Web Push message straight to a single subscription,
    /// bypassing channel matching entirely — the tenant-portal device
    /// list's "send test notification" button, not part of the normal
    /// publish path. Returns `false` (nothing sent, not an error) when
    /// Web Push isn't configured on this instance at all.
    pub fn send_test(&self, tenant_id: TenantId, subscription: WebPushSubscription, payload: &str) -> bool {
        match &self.web_push {
            Some(web_push) => {
                web_push.submit(build_web_push_job(tenant_id, "test", payload, vec![subscription]));
                true
            }
            None => false,
        }
    }
}
