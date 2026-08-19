//! # TenantSecretRepository
//!
//! **Action:** Raw concurrent storage of per-tenant HMAC secrets.
//! **Input:** Tenant IDs and secret bytes.
//! **Output:** Secret bytes.
//! **Side effects:** In-memory `DashMap` mutation only.
//! **Dependencies:** `dashmap`, `entities::ChannelKey`.
//!
//! `DashMap` allows adding/removing tenants on the fly (e.g. via an
//! internal Admin API) without a service restart or blocking validations
//! in flight for other tenants.

use dashmap::DashMap;

use crate::entities::ChannelKey::TenantId;

pub struct TenantSecretRepository {
    secrets: DashMap<TenantId, Vec<u8>>,
}

impl TenantSecretRepository {
    pub fn new() -> Self {
        Self {
            secrets: DashMap::new(),
        }
    }

    pub fn register(&self, tenant_id: TenantId, secret: impl Into<Vec<u8>>) {
        self.secrets.insert(tenant_id, secret.into());
    }

    pub fn revoke(&self, tenant_id: TenantId) {
        self.secrets.remove(&tenant_id);
    }

    pub fn get(&self, tenant_id: &TenantId) -> Option<dashmap::mapref::one::Ref<'_, TenantId, Vec<u8>>> {
        self.secrets.get(tenant_id)
    }
}

impl Default for TenantSecretRepository {
    fn default() -> Self {
        Self::new()
    }
}
