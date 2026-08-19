//! # MetricsService
//!
//! **Action:** Prometheus metrics registry for the realtime engine.
//! **Input:** Connection/frame/push/rate-limit events recorded by other modules.
//! **Output:** Prometheus text exposition format via `render()`.
//! **Side effects:** In-memory counter/gauge/histogram mutation only.
//! **Dependencies:** `prometheus`, `entities::ChannelKey`.
//!
//! Exposed on `/api/v1/system/metrics`, served from the Admin port rather
//! than the public WebSocket/TCP port: this is operational data for the
//! scraping system, not application traffic, and must not be reachable
//! from outside like the rest of the Admin API.
//!
//! Metrics (prefix `realtime_engine_`):
//! - `ws_connections_active` / `tcp_connections_active` (gauges)
//! - `messages_total{tenant_id,opcode}` (counter, every successfully processed frame)
//! - `frame_processing_seconds{opcode}` (processing latency histogram)
//! - `push_fallback_total{tenant_id}` (FCM notifications triggered as fallback)
//! - `rate_limited_total{tenant_id}` (frames rejected by the rate limiter)

use std::sync::Arc;
use std::time::Duration;

use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Opts, Registry, TextEncoder,
};

use crate::entities::ChannelKey::TenantId;

/// Network transport of a connection, to distinguish WS/TCP gauges.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transport {
    WebSocket,
    Tcp,
}

/// Application metrics registry. Held once in the DI context (via `Arc`)
/// and shared by every network handler and the Admin API — Prometheus
/// types (`IntGauge`, `*Vec`) are already thread-safe (`Sync`) internally,
/// no extra lock needed.
pub struct MetricsService {
    registry: Registry,
    ws_connections_active: IntGauge,
    tcp_connections_active: IntGauge,
    messages_total: IntCounterVec,
    frame_processing_seconds: HistogramVec,
    push_fallback_total: IntCounterVec,
    rate_limited_total: IntCounterVec,
}

impl MetricsService {
    pub fn new() -> Arc<Self> {
        let registry = Registry::new();

        let ws_connections_active = IntGauge::new(
            "realtime_engine_ws_connections_active",
            "Number of currently open WebSocket connections",
        )
        .expect("invalid metric definition");

        let tcp_connections_active = IntGauge::new(
            "realtime_engine_tcp_connections_active",
            "Number of currently open raw TCP connections",
        )
        .expect("invalid metric definition");

        let messages_total = IntCounterVec::new(
            Opts::new(
                "realtime_engine_messages_total",
                "Total number of successfully processed frames",
            ),
            &["tenant_id", "opcode"],
        )
        .expect("invalid metric definition");

        let frame_processing_seconds = HistogramVec::new(
            HistogramOpts::new(
                "realtime_engine_frame_processing_seconds",
                "Server-side frame processing latency (parsing + business logic, excluding network I/O)",
            )
            .buckets(vec![
                0.00005, 0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1,
            ]),
            &["opcode"],
        )
        .expect("invalid metric definition");

        let push_fallback_total = IntCounterVec::new(
            Opts::new(
                "realtime_engine_push_fallback_total",
                "Number of notifications switched to the FCM push fallback (no active socket subscriber)",
            ),
            &["tenant_id"],
        )
        .expect("invalid metric definition");

        let rate_limited_total = IntCounterVec::new(
            Opts::new(
                "realtime_engine_rate_limited_total",
                "Number of frames rejected by the rate limiter (Token Bucket)",
            ),
            &["tenant_id"],
        )
        .expect("invalid metric definition");

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

    /// Records a successfully processed frame with its processing latency.
    /// `opcode` is a static label string (`"PUB"`, `"SUB"`, ...) rather
    /// than the raw byte, more readable in Grafana.
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

    /// Renders the current registry state in Prometheus text exposition
    /// format, ready to return as-is as an HTTP response body.
    pub fn render(&self) -> String {
        let families = self.registry.gather();
        let mut buffer = Vec::new();
        TextEncoder::new()
            .encode(&families, &mut buffer)
            .expect("Prometheus encoding is infallible for well-formed metrics");
        String::from_utf8(buffer).expect("TextEncoder output is always valid UTF-8")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn render_includes_registered_metric_names() {
        let metrics = MetricsService::new();
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
        let metrics = MetricsService::new();
        metrics.connection_opened(Transport::Tcp);
        metrics.connection_opened(Transport::Tcp);
        metrics.connection_closed(Transport::Tcp);
        let output = metrics.render();
        assert!(output.contains("realtime_engine_tcp_connections_active 1"));
    }
}
