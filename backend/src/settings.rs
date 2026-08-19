//! # settings
//!
//! **Action:** Loads process configuration from environment variables
//! (BACKEND.md §21 "Environment & Configuration Reference").
//! **Input:** Environment variables.
//! **Output:** `Settings`.
//! **Side effects:** Reads `std::env`.
//! **Dependencies:** None.

use std::time::Duration;

pub struct Settings {
    pub ws_bind_addr: &'static str,
    pub tcp_bind_addr: &'static str,
    pub admin_bind_addr: &'static str,
    pub presence_timeout: Duration,
    pub presence_sweep_interval: Duration,
    /// TODO production: load tenant secrets from an external source
    /// (database, secret manager, Docker-mounted volume file) rather than
    /// this env-var-driven demo tenant.
    pub demo_tenant_secret: Option<String>,
    pub fcm_project_id: String,
    pub fcm_bearer_token: String,
    /// `None` disables multi-instance broadcast (single-instance mode, no
    /// Redis dependency) — a first-class deployment mode, not a degraded fallback.
    pub redis_url: Option<String>,
    /// `None` means no `ADMIN_API_TOKEN` was provided: the caller must
    /// generate a temporary one and log it, since it wouldn't survive a
    /// restart anyway (dev convenience, never leave this as-is in production).
    pub admin_api_token: Option<String>,
}

impl Settings {
    pub fn from_env() -> Self {
        Self {
            ws_bind_addr: "0.0.0.0:8080",
            tcp_bind_addr: "0.0.0.0:7878",
            admin_bind_addr: "0.0.0.0:9090",
            presence_timeout: Duration::from_secs(30),
            presence_sweep_interval: Duration::from_secs(5),
            demo_tenant_secret: std::env::var("DEMO_TENANT_SECRET").ok(),
            fcm_project_id: std::env::var("FCM_PROJECT_ID").unwrap_or_default(),
            fcm_bearer_token: std::env::var("FCM_BEARER_TOKEN").unwrap_or_default(),
            redis_url: std::env::var("REDIS_URL").ok(),
            admin_api_token: std::env::var("ADMIN_API_TOKEN").ok(),
        }
    }
}
