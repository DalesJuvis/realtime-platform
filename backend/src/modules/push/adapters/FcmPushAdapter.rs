//! # FcmPushAdapter
//!
//! **Action:** `PushPort` implementation dispatching push jobs to Google
//! FCM over HTTP/2 (HTTP v1 API).
//! **Input:** `PushJob`s submitted via the `PushPort` trait.
//! **Output:** None — fire-and-forget with logged failures.
//! **Side effects:** Outbound HTTPS calls to `fcm.googleapis.com`; spawns a background Tokio worker task.
//! **Dependencies:** `reqwest`, `tokio::sync::mpsc`, `ports::PushPort`, `dto::PushJob`.
//!
//! The `mpsc` decoupling is deliberate: FCM latency or errors must never
//! slow down the realtime publish hot path for other tenants.

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tokio::sync::mpsc;

use crate::modules::push::dto::PushJob::PushJob;
use crate::modules::push::ports::PushPort::PushPort;

/// Capacity of the mpsc channel between publish handlers and the FCM
/// worker. Beyond this, `submit()` drops the job rather than blocking the
/// producer: the realtime socket path must never wait on FCM.
const PUSH_QUEUE_CAPACITY: usize = 4096;

/// HTTP v1 FCM client configuration.
#[derive(Debug, Clone)]
pub struct FcmConfig {
    /// Firebase project ID — used in
    /// `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`.
    pub project_id: String,
    /// OAuth2 bearer token for the HTTP v1 API. In production this must be
    /// refreshed periodically by an external component (Google service
    /// account); this adapter consumes it as-is rather than managing the
    /// OAuth2 lifecycle itself.
    pub bearer_token: String,
}

#[derive(Serialize)]
struct FcmEnvelope<'a> {
    message: FcmMessage<'a>,
}

#[derive(Serialize)]
struct FcmMessage<'a> {
    token: &'a str,
    notification: FcmNotification<'a>,
}

#[derive(Serialize)]
struct FcmNotification<'a> {
    title: &'a str,
    body: &'a str,
}

/// Push dispatcher: holds the job input channel. The consuming worker
/// (shared HTTP/2 client) runs in a background Tokio task started by `spawn`.
pub struct FcmPushAdapter {
    tx: mpsc::Sender<PushJob>,
}

impl FcmPushAdapter {
    /// Starts the worker and returns a clonable (`Arc`) handle to keep in
    /// the server context to submit jobs to it.
    pub fn spawn(config: FcmConfig) -> Arc<Self> {
        let (tx, mut rx) = mpsc::channel::<PushJob>(PUSH_QUEUE_CAPACITY);

        tokio::spawn(async move {
            // Reused HTTP/2 client: avoids paying the TLS/HTTP2 handshake
            // cost on every notification.
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .expect("failed to build reqwest FCM client");

            while let Some(job) = rx.recv().await {
                if let Err(err) = dispatch_job(&client, &config, &job).await {
                    tracing::warn!(
                        tenant_id = %job.tenant_id,
                        channel = %job.channel_id,
                        error = %err,
                        "FCM push notification delivery failed"
                    );
                }
            }
        });

        Arc::new(Self { tx })
    }
}

impl PushPort for FcmPushAdapter {
    fn submit(&self, job: PushJob) {
        if job.target_tokens.is_empty() {
            // Nothing to push (device token mapping not resolved upstream):
            // avoid cluttering the queue for nothing.
            return;
        }
        if self.tx.try_send(job).is_err() {
            tracing::warn!("push queue saturated, notification dropped");
        }
    }
}

async fn dispatch_job(
    client: &reqwest::Client,
    config: &FcmConfig,
    job: &PushJob,
) -> Result<(), reqwest::Error> {
    let url = format!(
        "https://fcm.googleapis.com/v1/projects/{}/messages:send",
        config.project_id
    );

    for token in &job.target_tokens {
        let envelope = FcmEnvelope {
            message: FcmMessage {
                token,
                notification: FcmNotification {
                    title: &job.channel_id,
                    body: &job.payload,
                },
            },
        };

        client
            .post(&url)
            .bearer_auth(&config.bearer_token)
            .json(&envelope)
            .send()
            .await?
            .error_for_status()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::push::dto::PushJob::build_push_job;
    use uuid::Uuid;

    #[tokio::test]
    async fn submit_without_tokens_is_dropped_silently() {
        let adapter = FcmPushAdapter::spawn(FcmConfig {
            project_id: "test-project".into(),
            bearer_token: "test-token".into(),
        });
        // No target tokens: must neither panic nor block.
        adapter.submit(build_push_job(Uuid::from_u128(1), "room-1", "hi", vec![]));
    }
}
