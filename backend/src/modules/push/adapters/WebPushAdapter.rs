//! # WebPushAdapter
//!
//! **Action:** `WebPushPort` implementation dispatching Web Push jobs to
//! each subscription's push service (the browser vendor's endpoint —
//! `fcm.googleapis.com`, `updates.push.services.mozilla.com`, etc. —
//! whichever `PushManager.subscribe()` returned), per RFC 8030/8291/8292.
//! **Input:** `WebPushJob`s submitted via the `WebPushPort` trait.
//! **Output:** None — fire-and-forget with logged failures.
//! **Side effects:** Outbound HTTPS calls to each subscription's `endpoint`;
//! spawns a background Tokio worker task.
//! **Dependencies:** `reqwest`, `tokio::sync::mpsc`, `services::WebPushCrypto`.
//!
//! Same `mpsc` decoupling as `FcmPushAdapter`, same reason: a slow/down
//! push service must never slow down the realtime publish hot path.
//!
//! **What "sent" does and doesn't mean.** A `202 Accepted` from the push
//! service means it accepted the encrypted message for delivery to the
//! browser — not that the browser received it. Actual delivery still
//! depends on the OS/browser being reachable by that push service at all
//! (a fully quit browser on a machine that's asleep gets nothing until it
//! wakes and reconnects; most desktop OSes let Chrome/Edge keep a minimal
//! background process for exactly this even with all windows closed, but
//! that's an OS/browser policy this backend has no visibility into or
//! control over). `404`/`410` responses mean the subscription is gone
//! (unsubscribed, expired, or the browser data was cleared) — logged
//! distinctly below, but this adapter has no database access by design
//! (see `WebPushPort`'s doc comment on layering), so pruning those rows
//! from `push_subscriptions` on `404`/`410` is a natural next step, not
//! yet wired up: for now they just keep getting resubmitted and keep
//! failing the same way, at the cost of one extra failed HTTP call per
//! stale subscription per publish.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;

use crate::modules::push::dto::WebPushJob::WebPushJob;
use crate::modules::push::ports::WebPushPort::WebPushPort;
use crate::modules::push::services::WebPushCrypto::{encrypt_aes128gcm, VapidKeys};

/// Mirrors `FcmPushAdapter::PUSH_QUEUE_CAPACITY` — same rationale (`submit()`
/// drops rather than blocks the producer once saturated).
const PUSH_QUEUE_CAPACITY: usize = 4096;

/// RFC 8030 `TTL` header: how long the push service should hold the
/// message if the recipient isn't reachable right now. 4 weeks is the
/// commonly used "as long as push services generally allow" ceiling.
const TTL_SECS: u64 = 60 * 60 * 24 * 28;

pub struct WebPushAdapter {
    tx: mpsc::Sender<WebPushJob>,
}

impl WebPushAdapter {
    pub fn spawn(vapid: Arc<VapidKeys>) -> Arc<Self> {
        let (tx, mut rx) = mpsc::channel::<WebPushJob>(PUSH_QUEUE_CAPACITY);

        tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("failed to build reqwest Web Push client");

            while let Some(job) = rx.recv().await {
                dispatch_job(&client, &vapid, &job).await;
            }
        });

        Arc::new(Self { tx })
    }
}

impl WebPushPort for WebPushAdapter {
    fn submit(&self, job: WebPushJob) {
        if job.subscriptions.is_empty() {
            return;
        }
        if self.tx.try_send(job).is_err() {
            tracing::warn!("web push queue saturated, notification dropped");
        }
    }
}

async fn dispatch_job(client: &reqwest::Client, vapid: &VapidKeys, job: &WebPushJob) {
    for sub in &job.subscriptions {
        let audience = match push_service_origin(&sub.endpoint) {
            Some(origin) => origin,
            None => {
                tracing::warn!(endpoint = %sub.endpoint, "skipping push subscription with an unparseable endpoint URL");
                continue;
            }
        };

        let body = match encrypt_aes128gcm(job.payload.as_bytes(), &sub.p256dh_key, &sub.auth_key) {
            Ok(body) => body,
            Err(err) => {
                tracing::warn!(
                    tenant_id = %job.tenant_id, channel = %job.channel_id, error = %err,
                    "failed to encrypt web push payload (malformed subscription keys?)"
                );
                continue;
            }
        };

        let result = client
            .post(&sub.endpoint)
            .header("Content-Type", "application/octet-stream")
            .header("Content-Encoding", "aes128gcm")
            .header("TTL", TTL_SECS.to_string())
            .header("Authorization", vapid.authorization_header(&audience))
            .body(body)
            .send()
            .await;

        match result {
            Ok(resp) if resp.status().is_success() => {}
            Ok(resp) if resp.status().as_u16() == 404 || resp.status().as_u16() == 410 => {
                tracing::info!(
                    endpoint = %sub.endpoint, status = %resp.status(),
                    "push subscription no longer valid (expired/unsubscribed) — see WebPushAdapter's doc comment on cleanup"
                );
            }
            Ok(resp) => {
                tracing::warn!(endpoint = %sub.endpoint, status = %resp.status(), "web push send rejected by push service");
            }
            Err(err) => {
                tracing::warn!(endpoint = %sub.endpoint, error = %err, "web push send failed");
            }
        }
    }
}

/// The push service's origin (`scheme://host`, no path) — required as the
/// VAPID JWT's exact `aud` claim (RFC 8292 §2), distinct from the full
/// `endpoint` URL (which includes a per-subscription path/id).
fn push_service_origin(endpoint: &str) -> Option<String> {
    let url = url::Url::parse(endpoint).ok()?;
    Some(format!("{}://{}", url.scheme(), url.host_str()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_service_origin_strips_path_and_query() {
        assert_eq!(
            push_service_origin("https://fcm.googleapis.com/fcm/send/abc123?x=1"),
            Some("https://fcm.googleapis.com".to_string())
        );
    }

    #[test]
    fn push_service_origin_rejects_unparseable_urls() {
        assert_eq!(push_service_origin("not a url"), None);
    }

    #[tokio::test]
    async fn submit_without_subscriptions_is_dropped_silently() {
        let vapid = Arc::new(VapidKeys::from_env(
            &base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                p256::SecretKey::random(&mut rand::rngs::OsRng).to_bytes(),
            ),
            "mailto:ops@example.com".to_string(),
        ).unwrap());
        let adapter = WebPushAdapter::spawn(vapid);
        adapter.submit(crate::modules::push::dto::WebPushJob::build_web_push_job(
            uuid::Uuid::from_u128(1),
            "room-1",
            "hi",
            vec![],
        ));
    }
}
