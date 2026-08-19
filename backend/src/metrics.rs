//! `metrics.rs` — Métriques Prometheus (roadmap "Dashboard de Monitoring
//! & Métriques").
//!
//! Expose `/metrics` au format d'exposition Prometheus texte, servi sur
//! le port Admin (interne) plutôt que sur le port WebSocket/TCP public :
//! c'est une donnée opérationnelle destinée au système de scraping, pas
//! au trafic applicatif, et elle ne doit pas être atteignable depuis
//! l'extérieur au même titre que le reste de l'Admin API.
//!
//! Métriques exposées (préfixe `realtime_engine_`) :
//! - `ws_connections_active` / `tcp_connections_active` (gauges)
//! - `messages_total{tenant_id,opcode}` (compteur, tout frame traité avec succès)
//! - `frame_processing_seconds{opcode}` (histogramme de latence de traitement)
//! - `push_fallback_total{tenant_id}` (notifications FCM déclenchées en fallback)
//! - `rate_limited_total{tenant_id}` (frames rejetés par le rate limiter)

use std::sync::Arc;
use std::time::Duration;

use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Opts, Registry, TextEncoder,
};

use crate::state::TenantId;

/// Transport réseau d'une connexion, pour distinguer les gauges WS/TCP.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transport {
    WebSocket,
    Tcp,
}

/// Registre de métriques applicatif. Détenu une seule fois dans
/// `ServerContext` (via `Arc`) et partagé par tous les handlers réseau et
/// l'Admin API — les types Prometheus (`IntGauge`, `*Vec`) sont déjà
/// thread-safe (`Sync`) en interne, pas besoin de verrou supplémentaire.
pub struct Metrics {
    registry: Registry,
    ws_connections_active: IntGauge,
    tcp_connections_active: IntGauge,
    messages_total: IntCounterVec,
    frame_processing_seconds: HistogramVec,
    push_fallback_total: IntCounterVec,
    rate_limited_total: IntCounterVec,
}

impl Metrics {
    pub fn new() -> Arc<Self> {
        let registry = Registry::new();

        let ws_connections_active = IntGauge::new(
            "realtime_engine_ws_connections_active",
            "Nombre de connexions WebSocket actuellement ouvertes",
        )
        .expect("définition de métrique invalide");

        let tcp_connections_active = IntGauge::new(
            "realtime_engine_tcp_connections_active",
            "Nombre de connexions TCP brutes actuellement ouvertes",
        )
        .expect("définition de métrique invalide");

        let messages_total = IntCounterVec::new(
            Opts::new(
                "realtime_engine_messages_total",
                "Nombre total de frames traités avec succès",
            ),
            &["tenant_id", "opcode"],
        )
        .expect("définition de métrique invalide");

        let frame_processing_seconds = HistogramVec::new(
            HistogramOpts::new(
                "realtime_engine_frame_processing_seconds",
                "Latence de traitement d'un frame côté serveur (parsing + logique métier, hors I/O réseau)",
            )
            // Bornes adaptées à un traitement en mémoire attendu en
            // microsecondes/millisecondes, pas en secondes.
            .buckets(vec![
                0.00005, 0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1,
            ]),
            &["opcode"],
        )
        .expect("définition de métrique invalide");

        let push_fallback_total = IntCounterVec::new(
            Opts::new(
                "realtime_engine_push_fallback_total",
                "Nombre de notifications basculées vers le fallback push FCM (aucun abonné socket actif)",
            ),
            &["tenant_id"],
        )
        .expect("définition de métrique invalide");

        let rate_limited_total = IntCounterVec::new(
            Opts::new(
                "realtime_engine_rate_limited_total",
                "Nombre de frames rejetés par le rate limiter (Token Bucket)",
            ),
            &["tenant_id"],
        )
        .expect("définition de métrique invalide");

        // `register` échoue seulement en cas de collision de nom de
        // métrique — impossible ici puisque tous les noms sont distincts
        // et définis localement dans cette seule fonction.
        registry.register(Box::new(ws_connections_active.clone())).unwrap();
        registry.register(Box::new(tcp_connections_active.clone())).unwrap();
        registry.register(Box::new(messages_total.clone())).unwrap();
        registry.register(Box::new(frame_processing_seconds.clone())).unwrap();
        registry.register(Box::new(push_fallback_total.clone())).unwrap();
        registry.register(Box::new(rate_limited_total.clone())).unwrap();

        Arc::new(Self {
            registry,
            ws_connections_active,
            tcp_connections_active,
            messages_total,
            frame_processing_seconds,
            push_fallback_total,
            rate_limited_total,
        })
    }

    pub fn connection_opened(&self, transport: Transport) {
        match transport {
            Transport::WebSocket => self.ws_connections_active.inc(),
            Transport::Tcp => self.tcp_connections_active.inc(),
        }
    }

    pub fn connection_closed(&self, transport: Transport) {
        match transport {
            Transport::WebSocket => self.ws_connections_active.dec(),
            Transport::Tcp => self.tcp_connections_active.dec(),
        }
    }

    /// Enregistre un frame traité avec succès, avec sa latence de
    /// traitement. `opcode` est une chaîne statique (`"PUB"`, `"SUB"`,
    /// ...) plutôt que le byte brut, plus lisible dans Grafana.
    pub fn record_frame(&self, tenant_id: TenantId, opcode: &str, duration: Duration) {
        self.messages_total
            .with_label_values(&[&tenant_id.to_string(), opcode])
            .inc();
        self.frame_processing_seconds
            .with_label_values(&[opcode])
            .observe(duration.as_secs_f64());
    }

    pub fn record_push_fallback(&self, tenant_id: TenantId) {
        self.push_fallback_total
            .with_label_values(&[&tenant_id.to_string()])
            .inc();
    }

    pub fn record_rate_limited(&self, tenant_id: TenantId) {
        self.rate_limited_total
            .with_label_values(&[&tenant_id.to_string()])
            .inc();
    }

    /// Rend l'état courant du registre au format d'exposition Prometheus
    /// texte, prêt à être renvoyé tel quel comme corps de réponse HTTP.
    pub fn render(&self) -> String {
        let families = self.registry.gather();
        let mut buffer = Vec::new();
        TextEncoder::new()
            .encode(&families, &mut buffer)
            .expect("encodage Prometheus infaillible pour des métriques bien formées");
        String::from_utf8(buffer).expect("la sortie de TextEncoder est toujours de l'UTF-8 valide")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn render_includes_registered_metric_names() {
        let metrics = Metrics::new();
        metrics.connection_opened(Transport::WebSocket);
        metrics.record_frame(Uuid::from_u128(1), "PUB", Duration::from_micros(120));
        metrics.record_push_fallback(Uuid::from_u128(1));
        metrics.record_rate_limited(Uuid::from_u128(1));

        let output = metrics.render();
        assert!(output.contains("realtime_engine_ws_connections_active 1"));
        assert!(output.contains("realtime_engine_messages_total"));
        assert!(output.contains("realtime_engine_frame_processing_seconds"));
        assert!(output.contains("realtime_engine_push_fallback_total"));
        assert!(output.contains("realtime_engine_rate_limited_total"));
    }

    #[test]
    fn connection_gauges_track_open_close() {
        let metrics = Metrics::new();
        metrics.connection_opened(Transport::Tcp);
        metrics.connection_opened(Transport::Tcp);
        metrics.connection_closed(Transport::Tcp);
        let output = metrics.render();
        assert!(output.contains("realtime_engine_tcp_connections_active 1"));
    }
}
