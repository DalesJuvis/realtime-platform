//! # RateLimitService
//!
//! **Action:** Two-level Token Bucket anti-abuse rate limiting.
//! **Input:** Session/tenant IDs on every inbound frame.
//! **Output:** `bool` — whether the frame may proceed.
//! **Side effects:** In-memory bucket state mutation only.
//! **Dependencies:** `dashmap`, `entities::ChannelKey`, `entities::RateLimitConfig`.
//!
//! Two buckets checked per frame:
//! - **per session**: a socket cannot exceed its own rate, regardless of
//!   tenant — protects against a single compromised/buggy client (e.g. an
//!   infinite PUB loop);
//! - **per tenant**: aggregates all sockets of the same tenant — protects
//!   the service against an entire tenant flooding it via many concurrent connections.
//!
//! `check()` is amortized O(1): a `DashMap` lookup plus a few float ops, no
//! allocation and no dedicated background task (bucket refill is computed
//! lazily on each call). No separate repository split here: the refill
//! math *is* the bucket's storage, so there's no meaningful "pure data
//! access" layer to peel off without adding ceremony for nothing.

use std::time::Instant;

use dashmap::DashMap;

use crate::entities::ChannelKey::{SessionId, TenantId};
use crate::entities::RateLimitConfig::RateLimitConfig;

struct TokenBucket {
    capacity: f64,
    tokens: f64,
    refill_per_sec: f64,
    last_refill: Instant,
}

impl TokenBucket {
    fn new(capacity: u32, refill_per_sec: u32) -> Self {
        Self {
            capacity: capacity as f64,
            tokens: capacity as f64,
            refill_per_sec: refill_per_sec as f64,
            last_refill: Instant::now(),
        }
    }

    /// Attempts to consume 1 token, refilling first pro-rata to elapsed
    /// time since the last call — no global clock to synchronize, constant
    /// cost regardless of how many buckets are managed.
    fn try_consume(&mut self) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.last_refill = now;
        self.tokens = (self.tokens + elapsed * self.refill_per_sec).min(self.capacity);

        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

/// Registry of buckets — one per session, one per tenant — in `DashMap`s
/// for lock-free concurrent access, consistent with the rest of the
/// realtime module. `overrides` lets the Admin API adjust a specific
/// tenant's quotas on the fly, without a restart.
pub struct RateLimitService {
    default_config: RateLimitConfig,
    overrides: DashMap<TenantId, RateLimitConfig>,
    per_session: DashMap<SessionId, TokenBucket>,
    per_tenant: DashMap<TenantId, TokenBucket>,
}

impl RateLimitService {
    pub fn new(default_config: RateLimitConfig) -> Self {
        Self {
            default_config,
            overrides: DashMap::new(),
            per_session: DashMap::new(),
            per_tenant: DashMap::new(),
        }
    }

    fn config_for(&self, tenant_id: TenantId) -> RateLimitConfig {
        self.overrides.get(&tenant_id).map(|c| *c).unwrap_or(self.default_config)
    }

    /// Applies tenant-specific quotas, effective immediately (the existing
    /// tenant bucket is reset to reflect the new config on the next
    /// `check`). Meant to be called by the Admin API.
    ///
    /// Note: already-created *session* buckets for this tenant keep their
    /// original config until the connection ends — only the aggregated
    /// tenant bucket is immediately affected. Acceptable for short-to-medium
    /// lived realtime sessions; revisit if very long-lived connections are expected.
    pub fn set_tenant_limits(&self, tenant_id: TenantId, config: RateLimitConfig) {
        self.overrides.insert(tenant_id, config);
        self.per_tenant.remove(&tenant_id);
    }

    /// Clears a tenant's specific configuration, falling back to default
    /// quotas on the next `check`.
    pub fn clear_tenant_limits(&self, tenant_id: TenantId) {
        self.overrides.remove(&tenant_id);
        self.per_tenant.remove(&tenant_id);
    }

    /// Checks and consumes a token at both levels. Returns `true` only if
    /// both buckets (session AND tenant) accept it — whichever empties first blocks the frame.
    pub fn check(&self, session_id: SessionId, tenant_id: TenantId) -> bool {
        let cfg = self.config_for(tenant_id);

        let session_ok = self
            .per_session
            .entry(session_id)
            .or_insert_with(|| TokenBucket::new(cfg.session_capacity, cfg.session_refill_per_sec))
            .try_consume();

        let tenant_ok = self
            .per_tenant
            .entry(tenant_id)
            .or_insert_with(|| TokenBucket::new(cfg.tenant_capacity, cfg.tenant_refill_per_sec))
            .try_consume();

        session_ok && tenant_ok
    }

    /// Call on session close so `per_session` doesn't grow unbounded with
    /// dead buckets. The tenant bucket is deliberately never removed here:
    /// it must survive individual socket disconnect/reconnect for the same tenant.
    pub fn drop_session(&self, session_id: SessionId) {
        self.per_session.remove(&session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn allows_burst_up_to_capacity_then_blocks() {
        let limiter = RateLimitService::new(RateLimitConfig {
            session_capacity: 3,
            session_refill_per_sec: 1,
            tenant_capacity: 100,
            tenant_refill_per_sec: 100,
        });
        let session = Uuid::from_u128(1);
        let tenant = Uuid::from_u128(1);

        assert!(limiter.check(session, tenant));
        assert!(limiter.check(session, tenant));
        assert!(limiter.check(session, tenant));
        assert!(!limiter.check(session, tenant));
    }

    #[test]
    fn tenant_bucket_shared_across_sessions() {
        let limiter = RateLimitService::new(RateLimitConfig {
            session_capacity: 100,
            session_refill_per_sec: 100,
            tenant_capacity: 2,
            tenant_refill_per_sec: 1,
        });
        let tenant = Uuid::from_u128(1);
        let session_a = Uuid::from_u128(1);
        let session_b = Uuid::from_u128(2);

        assert!(limiter.check(session_a, tenant));
        assert!(limiter.check(session_b, tenant));
        assert!(!limiter.check(session_a, tenant));
    }

    #[test]
    fn refills_over_time() {
        let limiter = RateLimitService::new(RateLimitConfig {
            session_capacity: 1,
            session_refill_per_sec: 100,
            tenant_capacity: 100,
            tenant_refill_per_sec: 100,
        });
        let session = Uuid::from_u128(1);
        let tenant = Uuid::from_u128(1);

        assert!(limiter.check(session, tenant));
        assert!(!limiter.check(session, tenant));
        std::thread::sleep(std::time::Duration::from_millis(20));
        assert!(limiter.check(session, tenant));
    }

    #[test]
    fn tenant_override_applies_immediately() {
        let limiter = RateLimitService::new(RateLimitConfig {
            session_capacity: 100,
            session_refill_per_sec: 100,
            tenant_capacity: 100,
            tenant_refill_per_sec: 100,
        });
        let tenant = Uuid::from_u128(1);
        let session = Uuid::from_u128(1);

        assert!(limiter.check(session, tenant));

        limiter.set_tenant_limits(
            tenant,
            RateLimitConfig {
                session_capacity: 100,
                session_refill_per_sec: 100,
                tenant_capacity: 1,
                tenant_refill_per_sec: 0,
            },
        );

        assert!(limiter.check(session, tenant));
        assert!(!limiter.check(session, tenant));

        limiter.clear_tenant_limits(tenant);
        assert!(limiter.check(session, tenant));
    }

    #[test]
    fn drop_session_frees_its_bucket() {
        let limiter = RateLimitService::new(RateLimitConfig {
            session_capacity: 1,
            session_refill_per_sec: 1,
            tenant_capacity: 100,
            tenant_refill_per_sec: 100,
        });
        let session = Uuid::from_u128(1);
        let tenant = Uuid::from_u128(1);
        assert!(limiter.check(session, tenant));
        assert!(!limiter.check(session, tenant));
        limiter.drop_session(session);
        assert!(limiter.check(session, tenant));
    }
}
