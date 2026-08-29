//! # ApiKeyRepository
//!
//! **Action:** SQLite-backed storage of named, independently-revocable API
//! key pairs (`api_keys` table) — additive to (never a replacement for)
//! the tenant's own signup-issued primary secret in `tenant_secrets`;
//! see this repository's own callers for how the two coexist.
//!
//! `public_key` is generated independently per pair (`TokenService::
//! generate_public_key`), never `tenant_id` reused under a second field
//! name: an earlier version of this platform's downloadable credentials
//! file did exactly that (see `tenant-portal/src/lib/credentialsFile.ts`'s
//! own history) and it read as a bug — two credential-shaped fields
//! holding an identical value, no real second identifier in sight. A
//! generated key pair needs an actual distinct public identifier for the
//! same reason a Stripe `pk_`/`sk_` pair does.
//!
//! **Input:** `ApiKey` records.
//! **Output:** `ApiKey` records.
//! **Side effects:** Reads/writes the SQLite file at `PORTAL_DB_PATH`.
//! **Dependencies:** `sqlx`, `entities::ApiKey`.

use sqlx::SqlitePool;
use uuid::Uuid;

use crate::entities::ApiKey::{ApiKey, ApiKeyId, ApiKeyStatus};
use crate::entities::ChannelKey::TenantId;

pub struct ApiKeyRepository {
    pool: SqlitePool,
}

impl ApiKeyRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        tenant_id: TenantId,
        name: &str,
        public_key: &str,
        secret: &str,
    ) -> Result<ApiKey, sqlx::Error> {
        let id = Uuid::new_v4();
        let created_at = chrono::Utc::now();

        sqlx::query(
            "INSERT INTO api_keys (id, tenant_id, name, public_key, secret, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', ?)",
        )
        .bind(id.to_string())
        .bind(tenant_id.to_string())
        .bind(name)
        .bind(public_key)
        .bind(secret)
        .bind(created_at.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(ApiKey {
            id,
            tenant_id,
            name: name.to_string(),
            public_key: public_key.to_string(),
            secret: secret.to_string(),
            status: ApiKeyStatus::Active,
            created_at,
            revoked_at: None,
        })
    }

    /// Every key pair this tenant has ever generated, active or revoked —
    /// the caller decides how to present status, this just returns
    /// everything so revoked pairs stay visible (not silently deleted).
    pub async fn list_for_tenant(&self, tenant_id: TenantId) -> Result<Vec<ApiKey>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ApiKeyRow>(
            "SELECT id, tenant_id, name, public_key, secret, status, created_at, revoked_at
             FROM api_keys WHERE tenant_id = ? ORDER BY created_at ASC",
        )
        .bind(tenant_id.to_string())
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(ApiKeyRow::into_entity).collect())
    }

    /// One key pair by id, scoped to `tenant_id` — used before revoking to
    /// recover its `public_key` (the in-memory `TokenService` store is
    /// keyed by that, not by this row's id).
    pub async fn find_by_id(&self, tenant_id: TenantId, key_id: ApiKeyId) -> Result<Option<ApiKey>, sqlx::Error> {
        let row = sqlx::query_as::<_, ApiKeyRow>(
            "SELECT id, tenant_id, name, public_key, secret, status, created_at, revoked_at
             FROM api_keys WHERE id = ? AND tenant_id = ?",
        )
        .bind(key_id.to_string())
        .bind(tenant_id.to_string())
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(ApiKeyRow::into_entity))
    }

    /// Marks one key pair revoked — scoped to `tenant_id` so a caller can
    /// never revoke another tenant's key by guessing/enumerating an id.
    /// Returns `false` if no active row matched (already revoked, wrong
    /// tenant, or unknown id) rather than an error — the caller treats
    /// that as "not found", not a server fault.
    pub async fn revoke(&self, tenant_id: TenantId, key_id: ApiKeyId) -> Result<bool, sqlx::Error> {
        let revoked_at = chrono::Utc::now().to_rfc3339();
        let result = sqlx::query(
            "UPDATE api_keys SET status = 'revoked', revoked_at = ?
             WHERE id = ? AND tenant_id = ? AND status = 'active'",
        )
        .bind(revoked_at)
        .bind(key_id.to_string())
        .bind(tenant_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Every currently-active key pair, across every tenant — read once
    /// at boot to repopulate `TokenService`'s in-memory extra-key store,
    /// same reasoning as `TenantSecretStoreRepository::list_all`.
    pub async fn list_all_active(&self) -> Result<Vec<ApiKey>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ApiKeyRow>(
            "SELECT id, tenant_id, name, public_key, secret, status, created_at, revoked_at
             FROM api_keys WHERE status = 'active'",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(ApiKeyRow::into_entity).collect())
    }
}

#[derive(sqlx::FromRow)]
struct ApiKeyRow {
    id: String,
    tenant_id: String,
    name: String,
    public_key: String,
    secret: String,
    status: String,
    created_at: String,
    revoked_at: Option<String>,
}

impl ApiKeyRow {
    fn into_entity(self) -> ApiKey {
        ApiKey {
            id: Uuid::parse_str(&self.id).expect("stored id is always a valid UUID"),
            tenant_id: Uuid::parse_str(&self.tenant_id).expect("stored tenant_id is always a valid UUID"),
            name: self.name,
            public_key: self.public_key,
            secret: self.secret,
            status: ApiKeyStatus::parse(&self.status),
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .expect("stored created_at is always valid RFC3339")
                .with_timezone(&chrono::Utc),
            revoked_at: self.revoked_at.map(|s| {
                chrono::DateTime::parse_from_rfc3339(&s)
                    .expect("stored revoked_at is always valid RFC3339")
                    .with_timezone(&chrono::Utc)
            }),
        }
    }
}
