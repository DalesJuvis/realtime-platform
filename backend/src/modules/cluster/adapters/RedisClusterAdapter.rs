//! # RedisClusterAdapter
//!
//! **Action:** `ClusterBroadcastPort` implementation fanning frames out
//! across instances via Redis Pub/Sub.
//! **Input:** Locally-delivered frames to broadcast; frames received from Redis.
//! **Output:** Republishes remote frames into the local `ChannelRouterService`.
//! **Side effects:** Redis PUBLISH/SUBSCRIBE; spawns two background Tokio tasks.
//! **Dependencies:** `redis`, `ports::ClusterBroadcastPort`, `services::ChannelRouterService`.
//!
//! ## Design
//! Each instance publishes an envelope `{origin_instance_id (16B), raw
//! frame (256B)}` on a single Redis channel (`rt:cluster`), and subscribes
//! to that same channel; on receipt, if `origin != self`, the frame is
//! re-injected into the **local** router for fan-out to sockets connected
//! on this instance.
//!
//! Delivery to the origin instance's own subscribers stays direct via
//! `ChannelRouterService::publish()` (called by the realtime use cases
//! before `RedisClusterAdapter::broadcast()`) — Redis only serves
//! **inter**-instance fan-out, never the local path, to avoid paying a
//! network round-trip on the latency of subscribers co-located with the publisher.
//!
//! ## Known limitation (documented, not hidden)
//! The FCM push fallback decision is made from the **local** subscriber
//! count returned by `ChannelRouterService::publish()`. In a multi-instance
//! deployment, an instance with no local subscriber can trigger a
//! redundant FCM push even though another instance in the cluster does
//! have an active subscriber. Fix path: maintain a global cross-instance
//! subscriber counter in Redis (`INCR`/`DECR` on SUB/disconnect) and only
//! trigger the fallback when that global counter is zero — not implemented
//! here, to keep this module focused on fan-out transport alone.

use std::sync::Arc;

use futures_util::StreamExt;
use redis::AsyncCommands;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::entities::ChannelKey::ChannelKey;
use crate::entities::Frame::{Frame, FRAME_SIZE};
use crate::modules::cluster::ports::ClusterBroadcastPort::ClusterBroadcastPort;
use crate::modules::realtime::services::ChannelRouterService::ChannelRouterService;

const CLUSTER_CHANNEL: &str = "rt:cluster";
const ORIGIN_LEN: usize = 16;
const ENVELOPE_LEN: usize = ORIGIN_LEN + FRAME_SIZE;
const OUTBOUND_QUEUE_CAPACITY: usize = 4096;

fn encode_envelope(origin: Uuid, frame: &[u8; FRAME_SIZE]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(ENVELOPE_LEN);
    buf.extend_from_slice(origin.as_bytes());
    buf.extend_from_slice(frame);
    buf
}

/// Decodes an envelope received from Redis. Returns `None` if the size
/// doesn't match (message from another producer on the same channel,
/// incompatible protocol version, corruption, etc.) rather than panicking
/// on an externally-controlled stream.
fn decode_envelope(bytes: &[u8]) -> Option<(Uuid, [u8; FRAME_SIZE])> {
    if bytes.len() != ENVELOPE_LEN {
        return None;
    }
    let origin = Uuid::from_slice(&bytes[0..ORIGIN_LEN]).ok()?;
    let mut frame = [0u8; FRAME_SIZE];
    frame.copy_from_slice(&bytes[ORIGIN_LEN..]);
    Some((origin, frame))
}

pub struct RedisClusterAdapter {
    instance_id: Uuid,
    tx: mpsc::Sender<[u8; FRAME_SIZE]>,
}

impl RedisClusterAdapter {
    /// Connects to Redis and starts the two background tasks:
    /// - a consumer task that `PUBLISH`es outbound local frames;
    /// - a subscriber task (`SUBSCRIBE`) that re-injects frames emitted by
    ///   *other* instances into the local router.
    pub async fn connect(
        redis_url: &str,
        channel_router: Arc<ChannelRouterService>,
    ) -> Result<Arc<Self>, redis::RedisError> {
        let instance_id = Uuid::new_v4();
        let client = redis::Client::open(redis_url)?;

        let mut pub_conn = client.get_multiplexed_async_connection().await?;
        let (tx, mut rx) = mpsc::channel::<[u8; FRAME_SIZE]>(OUTBOUND_QUEUE_CAPACITY);

        tokio::spawn(async move {
            while let Some(frame) = rx.recv().await {
                let envelope = encode_envelope(instance_id, &frame);
                if let Err(err) = pub_conn
                    .publish::<_, _, ()>(CLUSTER_CHANNEL, envelope)
                    .await
                {
                    tracing::warn!(error = %err, "Redis PUBLISH failed (cluster bus)");
                }
            }
        });

        let mut sub_conn = client.get_async_pubsub().await?;
        sub_conn.subscribe(CLUSTER_CHANNEL).await?;

        tokio::spawn(async move {
            let mut stream = sub_conn.on_message();
            while let Some(msg) = stream.next().await {
                let payload: Vec<u8> = match msg.get_payload() {
                    Ok(p) => p,
                    Err(err) => {
                        tracing::warn!(error = %err, "unreadable Redis payload (cluster bus)");
                        continue;
                    }
                };

                let Some((origin, raw)) = decode_envelope(&payload) else {
                    continue;
                };
                if origin == instance_id {
                    continue; // already delivered locally when originally published
                }

                let frame = match Frame::parse(&raw) {
                    Ok(f) => f,
                    Err(err) => {
                        tracing::debug!(error = %err, "invalid frame received from cluster bus, ignored");
                        continue;
                    }
                };

                let key = ChannelKey::new(frame.tenant_id(), frame.channel_id());
                let _ = channel_router.publish(frame.tenant_id(), &key, raw);
            }
        });

        Ok(Arc::new(Self { instance_id, tx }))
    }
}

impl ClusterBroadcastPort for RedisClusterAdapter {
    fn broadcast(&self, frame: [u8; FRAME_SIZE]) {
        if self.tx.try_send(frame).is_err() {
            tracing::warn!("cluster bus queue saturated, frame dropped for inter-instance fan-out");
        }
    }

    fn instance_id(&self) -> Uuid {
        self.instance_id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_roundtrip() {
        let origin = Uuid::from_u128(42);
        let frame = crate::entities::Frame::FrameBuilder::new(
            crate::entities::Frame::Opcode::Message,
            Uuid::from_u128(1),
        )
        .channel_id("room-1")
        .payload("hello cluster")
        .build();

        let encoded = encode_envelope(origin, &frame);
        assert_eq!(encoded.len(), ENVELOPE_LEN);

        let (decoded_origin, decoded_frame) = decode_envelope(&encoded).unwrap();
        assert_eq!(decoded_origin, origin);
        assert_eq!(decoded_frame, frame);
    }

    #[test]
    fn decode_rejects_wrong_length() {
        assert!(decode_envelope(&[0u8; 10]).is_none());
        assert!(decode_envelope(&[0u8; ENVELOPE_LEN + 1]).is_none());
    }
}
