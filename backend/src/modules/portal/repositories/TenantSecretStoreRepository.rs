//! # TenantSecretStoreRepository
//!
//! **Action:** SQLite-backed durable copy of each self-serve tenant's
//! current HMAC secret — distinct from `auth::repositories::TenantSecretRepository`,
//! which is `TokenService`'s in-memory, request-hot-path secret store.
//! That one forgets everything on restart; this one is what `main.rs`
//! reloads from at boot to repopulate it, so a self-serve tenant's key
//! pair survives a restart the same way their `tenant_users` row already does.
//! **Input:** Tenant ID, secret.
//! **Output:** Secret string.
//! **Side effects:** Reads/writes the SQLite file at `PORTAL_DB_PATH`.
//! **Dependencies:** `sqlx`, `entities::ChannelKey`.

use sqlx::SqlitePool;

use crate::entities::ChannelKey::TenantId;

pub struct TenantSecretStoreRepository {
    pool: SqlitePool,
}

impl TenantSecretStoreRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Upserts this tenant's current secret — used on both first signup
    /// and every later rotation, so there is always at most one durable
    /// row per tenant (only the latest secret is ever valid, matching
    /// `TokenService::register_tenant`'s overwrite-on-register semantics).
    pub async fn upsert(&self, tenant_id: TenantId, secret: &str) -> Result<(), sqlx::Error> {
        let rotated_at = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO tenant_secrets (tenant_id, secret, rotated_at) VALUES (?, ?, ?)
             ON CONFLICT(tenant_id) DO UPDATE SET secret = excluded.secret, rotated_at = excluded.rotated_at",
        )
        .bind(tenant_id.to_string())
        .bind(secret)
        .bind(rotated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get(&self, tenant_id: TenantId) -> Result<Option<String>, sqlx::Error> {
        let row: Option<(String,)> = sqlx::query_as("SELECT secret FROM tenant_secrets WHERE tenant_id = ?")
            .bind(tenant_id.to_string())
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(|(secret,)| secret))
    }

    /// Every durably-stored `(tenant_id, secret)` pair — read once at
    /// boot to repopulate `TokenService`'s in-memory store (see the doc
    /// comment above).
    pub async fn list_all(&self) -> Result<Vec<(TenantId, String)>, sqlx::Error> {
        let rows: Vec<(String, String)> = sqlx::query_as("SELECT tenant_id, secret FROM tenant_secrets")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .into_iter()
            .filter_map(|(id, secret)| uuid::Uuid::parse_str(&id).ok().map(|id| (id, secret)))
            .collect())
    }
}
