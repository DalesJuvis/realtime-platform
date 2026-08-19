//! `push.rs` — Fallback notification push (contrainte #4).
//!
//! Quand un message est publié sur un canal et qu'aucun client n'est
//! connecté en socket (`MultiTenantRouter::publish` renvoie `0`), le
//! payload est basculé vers un worker asynchrone dédié qui pousse une
//! notification vers Google FCM via HTTP/2 (`reqwest`, API HTTP v1).
//!
//! Le découplage par canal `mpsc` est volontaire : la latence ou les
//! erreurs réseau vers FCM ne doivent jamais ralentir le chemin chaud de
//! publication temps réel des autres tenants.

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tokio::sync::mpsc;

use crate::state::TenantId;

/// Capacité du canal mpsc entre les handlers de publication et le worker
/// FCM. Au-delà, `submit()` abandonne le job plutôt que de bloquer le
/// producteur : le chemin socket temps réel ne doit jamais attendre FCM.
const PUSH_QUEUE_CAPACITY: usize = 4096;

/// Un message à pousser vers FCM suite à l'absence de client connecté.
#[derive(Debug, Clone)]
pub struct PushJob {
    pub tenant_id: TenantId,
    pub channel_id: String,
    pub payload: String,
    /// Jetons d'enregistrement FCM (ou noms de topic `/topics/xxx`) des
    /// destinataires. Résolus en amont (mapping tenant/canal → device
    /// tokens, typiquement en base) : ce module se limite au dispatch HTTP.
    pub target_tokens: Vec<String>,
}

/// Construit un `PushJob` à partir d'un frame publié sans abonné actif.
pub fn build_push_job(
    tenant_id: TenantId,
    channel_id: &str,
    payload: &str,
    target_tokens: Vec<String>,
) -> PushJob {
    PushJob {
        tenant_id,
        channel_id: channel_id.to_string(),
        payload: payload.to_string(),
        target_tokens,
    }
}

/// Configuration du client FCM HTTP v1.
#[derive(Debug, Clone)]
pub struct FcmConfig {
    /// Project ID Firebase — utilisé dans
    /// `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`.
    pub project_id: String,
    /// Jeton OAuth2 (Bearer) pour l'API HTTP v1. En production, ce jeton
    /// doit être rafraîchi périodiquement par un composant externe (compte
    /// de service Google) ; ce module le consomme tel quel au moment de
    /// l'appel plutôt que de gérer lui-même le cycle de vie OAuth2.
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

/// Dispatcher push : détient le canal d'entrée des jobs. Le worker
/// consommateur (client HTTP/2 partagé) tourne dans une tâche Tokio de
/// fond démarrée par `spawn`.
pub struct PushDispatcher {
    tx: mpsc::Sender<PushJob>,
}

impl PushDispatcher {
    /// Démarre le worker et retourne un handle clonable (`Arc`) à
    /// conserver dans le contexte serveur pour lui soumettre des jobs.
    pub fn spawn(config: FcmConfig) -> Arc<Self> {
        let (tx, mut rx) = mpsc::channel::<PushJob>(PUSH_QUEUE_CAPACITY);

        tokio::spawn(async move {
            // Client HTTP/2 réutilisé pour toutes les requêtes : évite le
            // coût du handshake TLS/HTTP2 à chaque notification.
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .expect("construction du client reqwest FCM");

            while let Some(job) = rx.recv().await {
                if let Err(err) = dispatch_job(&client, &config, &job).await {
                    tracing::warn!(
                        tenant_id = %job.tenant_id,
                        channel = %job.channel_id,
                        error = %err,
                        "échec d'envoi de notification push FCM"
                    );
                }
            }
        });

        Arc::new(Self { tx })
    }

    /// Soumet un job de push, non bloquant : si la file est pleine, le job
    /// est abandonné plutôt que de ralentir le chemin de publication temps
    /// réel — on préfère perdre une notification que dégrader la latence
    /// socket pour l'ensemble des tenants.
    pub fn submit(&self, job: PushJob) {
        if job.target_tokens.is_empty() {
            // Rien à pousser (mapping device tokens non résolu côté
            // appelant) : on évite d'encombrer la file pour rien.
            return;
        }
        if self.tx.try_send(job).is_err() {
            tracing::warn!("file de push saturée, notification abandonnée");
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
    use uuid::Uuid;

    #[test]
    fn build_push_job_copies_fields() {
        let tenant = Uuid::from_u128(1);
        let job = build_push_job(tenant, "room-1", "hello", vec!["device-token".into()]);
        assert_eq!(job.tenant_id, tenant);
        assert_eq!(job.channel_id, "room-1");
        assert_eq!(job.payload, "hello");
        assert_eq!(job.target_tokens, vec!["device-token".to_string()]);
    }

    #[tokio::test]
    async fn submit_without_tokens_is_dropped_silently() {
        let dispatcher = PushDispatcher::spawn(FcmConfig {
            project_id: "test-project".into(),
            bearer_token: "test-token".into(),
        });
        // Aucun token cible : ne doit ni paniquer ni bloquer.
        dispatcher.submit(build_push_job(Uuid::from_u128(1), "room-1", "hi", vec![]));
    }
}
