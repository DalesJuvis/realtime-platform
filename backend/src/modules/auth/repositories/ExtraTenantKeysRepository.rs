//! # ExtraTenantKeysRepository
//!
//! **Action:** Raw concurrent storage of additional, independently
//! revocable API key pairs per tenant — the request-hot-path counterpart
//! to `portal::repositories::ApiKeyRepository`'s durable copy, same
//! relationship `TenantSecretRepository` has to `TenantSecretStoreRepository`.
//! Deliberately a *separate* store from `TenantSecretRepository` rather
//! than folded into it: the tenant's one primary secret (signup, Settings'
//! rotate-in-place flow) is untouched by any of this — an "extra" key
//! pair is purely additive, never a replacement for it.
//! **Input:** Tenant IDs, public key identifiers, secret bytes.
//! **Output:** Secret bytes, matched-key lookups.
//! **Side effects:** In-memory `DashMap` mutation only.
//! **Dependencies:** `dashmap`, `entities::ChannelKey`.

use dashmap::DashMap;
use subtle::ConstantTimeEq;

use crate::entities::ChannelKey::TenantId;

#[derive(Clone)]
struct StoredKey {
    public_key: String,
    secret: Vec<u8>,
}

pub struct ExtraTenantKeysRepository {
    keys: DashMap<TenantId, Vec<StoredKey>>,
}

impl ExtraTenantKeysRepository {
    pub fn new() -> Self {
        Self { keys: DashMap::new() }
    }

    pub fn add(&self, tenant_id: TenantId, public_key: String, secret: Vec<u8>) {
        self.keys.entry(tenant_id).or_default().push(StoredKey { public_key, secret });
    }

    /// Removes every extra key pair for this tenant — used when the
    /// whole tenant is revoked, not just one key.
    pub fn revoke_all(&self, tenant_id: TenantId) {
        self.keys.remove(&tenant_id);
    }

    /// Removes the one entry matching `public_key` for this tenant.
    /// Returns whether an entry was actually found and removed.
    pub fn revoke(&self, tenant_id: TenantId, public_key: &str) -> bool {
        match self.keys.get_mut(&tenant_id) {
            Some(mut entries) => {
                let before = entries.len();
                entries.retain(|k| k.public_key != public_key);
                entries.len() != before
            }
            None => false,
        }
    }

    /// The first extra key (if any) whose secret constant-time-equals
    /// `secret` — used to answer "is this a currently valid extra key for
    /// this tenant" without leaking *which* key matched via timing.
    pub fn find_matching(&self, tenant_id: &TenantId, secret: &[u8]) -> Option<Vec<u8>> {
        self.keys.get(tenant_id)?.iter().find(|k| bool::from(k.secret.as_slice().ct_eq(secret))).map(|k| k.secret.clone())
    }

    /// Every currently-active extra secret for this tenant, tried in
    /// order by `TokenService::validate` until one's HMAC matches.
    pub fn get_all_secrets(&self, tenant_id: &TenantId) -> Vec<Vec<u8>> {
        self.keys.get(tenant_id).map(|v| v.iter().map(|k| k.secret.clone()).collect()).unwrap_or_default()
    }
}

impl Default for ExtraTenantKeysRepository {
    fn default() -> Self {
        Self::new()
    }
}
