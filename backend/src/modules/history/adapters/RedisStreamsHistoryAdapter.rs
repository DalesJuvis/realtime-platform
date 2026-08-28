//! # RedisStreamsHistoryAdapter
//!
//! **Action:** `HistoryPort` implementation backed by a Redis Stream per
//! channel (`XADD`/`XRANGE`) — durable, cross-restart, larger-than-the-
//! in-memory-ring-buffer catch-up history.
//! **Input:** Frames to persist; a channel + cutoff timestamp to read back.
//! **Output:** Matching frames, chronological, from `since`.
//! **Side effects:** Redis `XADD` (trimmed to `maxlen`, approximate) on a
//! background task; `XRANGE` inline on `since`.
//! **Dependencies:** `redis`, `ports::HistoryPort`.
//!
//! ## Design
//! One stream per `(tenant_id, channel_id)`, key `rt:history:{tenant}:{channel}`
//! — mirrors `ChannelKey`'s own isolation boundary, so there's no need to
//! re-check tenant ownership here (the caller, `ChannelRouterService`,
//! already did that before ever reaching this adapter). Each entry's
//! Redis-assigned ID (`XADD ... *`) is a millisecond timestamp already —
//! no separate timestamp field needed, unlike `HistoryBuffer::HistoryEntry`
//! which has to stamp its own since a `VecDeque` has no such built-in
//! ordering key.
//!
//! Writes go through the same fire-and-forget mpsc-plus-background-task
//! shape as `RedisClusterAdapter::broadcast` — `persist()` never blocks
//! the caller on a Redis round-trip. Reads (`since()`) are the one place
//! in this codebase an `.await` on real network I/O is unavoidable: see
//! `HistoryPort`'s own doc comment for why that's a deliberate, accepted
//! exception rather than an oversight.
//!
//! ## Known limitation (documented, not hidden)
//! `persist()`'s outbound queue is bounded (`OUTBOUND_QUEUE_CAPACITY`): if
//! Redis falls behind or drops, queued frames are dropped rather than
//! backing up into the publish path — same trade-off `RedisClusterAdapter`
//! makes, and for the same reason (a slow durability write must never slow
//! down message delivery to already-connected subscribers, who still get
//! the frame instantly via the in-memory broadcast bus regardless of this
//! adapter's state).

use std::sync::Arc;

use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::streams::StreamMaxlen;
use redis::AsyncCommands;
use tokio::sync::mpsc;

use crate::entities::ChannelKey::ChannelKey;
use crate::entities::Frame::FRAME_SIZE;
use crate::modules::history::ports::HistoryPort::HistoryPort;

const OUTBOUND_QUEUE_CAPACITY: usize = 4096;
const FRAME_FIELD: &str = "f";

fn stream_key(key: &ChannelKey) -> String {
    format!("rt:history:{}:{}", key.tenant_id, key.channel_id)
}

pub struct RedisStreamsHistoryAdapter {
    read_conn: MultiplexedConnection,
    tx: mpsc::Sender<(ChannelKey, [u8; FRAME_SIZE])>,
}

impl RedisStreamsHistoryAdapter {
    /// Connects to Redis and starts the background write task. `maxlen` is
    /// the approximate per-channel stream cap (`XADD ... MAXLEN ~`) — set
    /// well above `DEFAULT_HISTORY_CAPACITY` so this adapter is a strict
    /// upgrade over the in-memory buffer it replaces for REPLAY, not a
    /// lateral move.
    pub async fn connect(redis_url: &str, maxlen: usize) -> Result<Arc<Self>, redis::RedisError> {
        let client = redis::Client::open(redis_url)?;

        let read_conn = client.get_multiplexed_async_connection().await?;
        let mut write_conn = client.get_multiplexed_async_connection().await?;

        let (tx, mut rx) = mpsc::channel::<(ChannelKey, [u8; FRAME_SIZE])>(OUTBOUND_QUEUE_CAPACITY);

        tokio::spawn(async move {
            while let Some((key, frame)) = rx.recv().await {
                let stream_key = stream_key(&key);
                let result: redis::RedisResult<String> = write_conn
                    .xadd_maxlen(
                        &stream_key,
                        StreamMaxlen::Approx(maxlen),
                        "*",
                        &[(FRAME_FIELD, &frame[..])],
                    )
                    .await;
                if let Err(err) = result {
                    tracing::warn!(error = %err, stream = %stream_key, "Redis XADD failed (history stream)");
                }
            }
        });

        Ok(Arc::new(Self { read_conn, tx }))
    }
}

#[async_trait]
impl HistoryPort for RedisStreamsHistoryAdapter {
    fn persist(&self, key: &ChannelKey, frame: [u8; FRAME_SIZE]) {
        if self.tx.try_send((key.clone(), frame)).is_err() {
            tracing::warn!("history stream queue saturated, frame dropped for durable persistence");
        }
    }

    async fn since(&self, key: &ChannelKey, since_unix_secs: u64) -> Vec<[u8; FRAME_SIZE]> {
        let stream_key = stream_key(key);
        // Redis Stream IDs are "<ms>-<seq>"; a bare millisecond timestamp
        // is a valid start bound (seq defaults to 0), and "(" makes it
        // exclusive — matching `HistoryBuffer::since`'s "strictly after"
        // contract. `0` means "everything the stream still retains".
        let start = if since_unix_secs == 0 {
            "-".to_string()
        } else {
            format!("({}", since_unix_secs * 1000)
        };

        let mut conn = self.read_conn.clone();
        let reply: redis::RedisResult<redis::streams::StreamRangeReply> =
            conn.xrange(&stream_key, start, "+").await;

        let entries = match reply {
            Ok(r) => r.ids,
            Err(err) => {
                tracing::warn!(error = %err, stream = %stream_key, "Redis XRANGE failed (history stream)");
                return Vec::new();
            }
        };

        entries
            .into_iter()
            .filter_map(|entry| {
                let bytes: Vec<u8> = entry.get(FRAME_FIELD)?;
                <[u8; FRAME_SIZE]>::try_from(bytes).ok()
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::Frame::{FrameBuilder, Opcode};
    use uuid::Uuid;

    /// Requires a real Redis reachable at `REDIS_TEST_URL`
    /// (`redis://127.0.0.1:6379` if unset) — not run by a plain `cargo
    /// test` (see `#[ignore]`), same reasoning `RedisClusterAdapter` never
    /// got a live-Redis test at all: no such server is guaranteed present
    /// wherever this crate is built/tested. Run explicitly with a Redis
    /// available: `cargo test --lib history::adapters::RedisStreamsHistoryAdapter -- --ignored`.
    #[tokio::test]
    #[ignore = "requires a real Redis — see this test's own doc comment"]
    async fn persist_then_since_round_trips_through_real_redis() {
        let url = std::env::var("REDIS_TEST_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        let adapter = RedisStreamsHistoryAdapter::connect(&url, 1000)
            .await
            .expect("connect to test Redis");

        // Unique key per run so repeated test runs never see stale entries
        // from a previous run of this same test against the same Redis.
        let tenant_id = Uuid::new_v4();
        let key = ChannelKey::new(tenant_id, "integration-test-channel");

        let frame1 = FrameBuilder::new(Opcode::Publish, tenant_id)
            .channel_id("integration-test-channel")
            .payload("msg-1")
            .build();
        let frame2 = FrameBuilder::new(Opcode::Publish, tenant_id)
            .channel_id("integration-test-channel")
            .payload("msg-2")
            .build();

        adapter.persist(&key, frame1);
        adapter.persist(&key, frame2);

        // persist() is fire-and-forget (queued to a background task) —
        // give it a moment to actually reach Redis before reading back.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let replayed = adapter.since(&key, 0).await;
        assert_eq!(replayed, vec![frame1, frame2]);

        let replayed_all_again = adapter.since(&key, 0).await;
        assert_eq!(
            replayed_all_again.len(),
            2,
            "since(0) must be idempotent — reading back twice shouldn't consume or duplicate entries"
        );
    }

    #[tokio::test]
    #[ignore = "requires a real Redis — see this test's own doc comment"]
    async fn since_excludes_entries_at_or_before_the_cutoff() {
        let url = std::env::var("REDIS_TEST_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        let adapter = RedisStreamsHistoryAdapter::connect(&url, 1000)
            .await
            .expect("connect to test Redis");

        let tenant_id = Uuid::new_v4();
        let key = ChannelKey::new(tenant_id, "integration-test-cutoff");

        let before = FrameBuilder::new(Opcode::Publish, tenant_id)
            .channel_id("integration-test-cutoff")
            .payload("before-cutoff")
            .build();
        adapter.persist(&key, before);
        // Cross a full wall-clock second boundary before capturing the
        // cutoff, not just before Redis has the write — otherwise `before`
        // and `cutoff_secs` can land in the *same* second, and since()'s
        // millisecond-precision exclusive bound would then wrongly include
        // `before` (it only excludes strictly-earlier milliseconds, not
        // "the same second").
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await;

        let cutoff_secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await; // clear the same wall-clock second again

        let after = FrameBuilder::new(Opcode::Publish, tenant_id)
            .channel_id("integration-test-cutoff")
            .payload("after-cutoff")
            .build();
        adapter.persist(&key, after);
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let replayed = adapter.since(&key, cutoff_secs).await;
        assert_eq!(replayed, vec![after], "only the entry strictly after the cutoff should come back");
    }
}
