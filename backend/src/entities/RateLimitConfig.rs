//! # RateLimitConfig
//!
//! **Action:** Token-bucket rate limit quotas, adjustable per tenant at
//! runtime via the Admin API.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `serde`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub session_capacity: u32,
    pub session_refill_per_sec: u32,
    pub tenant_capacity: u32,
    pub tenant_refill_per_sec: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            session_capacity: 20,
            session_refill_per_sec: 10,
            tenant_capacity: 2_000,
            tenant_refill_per_sec: 500,
        }
    }
}
