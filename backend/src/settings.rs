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
    pub portal_bind_addr: &'static str,
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
    /// SQLite file backing `modules::portal`'s tenant-user accounts — the
    /// one piece of durable state in this backend. Defaults to a relative
    /// path so a bare `cargo run` still works without extra setup; mount a
    /// volume over it in production (see `docker-compose.yml`).
    pub portal_db_path: String,
    /// Signs portal session tokens (`modules::portal::services::PortalAuthService`).
    /// `None` means none was provided: like `admin_api_token`, a temporary
    /// one is generated and logged — fine for dev, but every portal login
    /// session breaks on restart, so set this explicitly for anything longer-lived.
    pub portal_session_secret: Option<String>,
    /// VAPID keypair (RFC 8292) signing every Web Push send —
    /// `modules::push::services::WebPushCrypto::VapidKeys`. Both `None`
    /// (the default) disables Web Push entirely: no unique-per-instance
    /// keys are ever generated silently the way `admin_api_token` is,
    /// because unlike that one, a VAPID keypair changing invalidates every
    /// already-registered browser subscription (a push service rejects a
    /// JWT signed by a key it didn't see at subscribe time) — restarting
    /// with a fresh keypair each time would make Web Push permanently
    /// non-functional rather than just less convenient. Generate a real
    /// pair once (see `sdk-typescript`/`web-client` README for the
    /// one-liner) and keep it stable. Base64url (no padding): public key
    /// is the 65-byte uncompressed P-256 point, private key the raw
    /// 32-byte scalar.
    pub vapid_public_key: Option<String>,
    pub vapid_private_key: Option<String>,
    /// A `mailto:` or `https:` URL identifying the sender, per RFC 8292 §2
    /// — some push services use this to contact you if your sends are
    /// misbehaving. Defaults to a placeholder if VAPID keys are set but
    /// this isn't: still valid, just worth setting for real.
    pub vapid_subject: String,
}

impl Settings {
    pub fn from_env() -> Self {
        Self {
            ws_bind_addr: "0.0.0.0:8080",
            tcp_bind_addr: "0.0.0.0:7878",
            admin_bind_addr: "0.0.0.0:9090",
            portal_bind_addr: "0.0.0.0:8090",
            presence_timeout: Duration::from_secs(30),
            presence_sweep_interval: Duration::from_secs(5),
            demo_tenant_secret: std::env::var("DEMO_TENANT_SECRET").ok(),
            fcm_project_id: std::env::var("FCM_PROJECT_ID").unwrap_or_default(),
            fcm_bearer_token: std::env::var("FCM_BEARER_TOKEN").unwrap_or_default(),
            redis_url: std::env::var("REDIS_URL").ok(),
            admin_api_token: std::env::var("ADMIN_API_TOKEN").ok(),
            portal_db_path: std::env::var("PORTAL_DB_PATH").unwrap_or_else(|_| "portal.db".to_string()),
            portal_session_secret: std::env::var("PORTAL_SESSION_SECRET").ok(),
            vapid_public_key: std::env::var("VAPID_PUBLIC_KEY").ok(),
            vapid_private_key: std::env::var("VAPID_PRIVATE_KEY").ok(),
            vapid_subject: std::env::var("VAPID_SUBJECT").unwrap_or_else(|_| "mailto:ops@example.com".to_string()),
        }
    }
}
