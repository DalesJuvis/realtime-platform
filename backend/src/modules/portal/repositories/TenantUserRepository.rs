//! # TenantUserRepository
//!
//! **Action:** SQLite-backed storage of portal login accounts — the one
//! piece of durable state in this backend (everything else, per
//! BACKEND.md's "no-DB" baseline for this project, lives in memory and
//! resets on restart). Deliberately per-instance, not shared: consistent
//! with tenant secrets/rate limits also being per-instance state (see
//! `TenantSecretRepository`), and avoids introducing cross-instance
//! coordination this project has never needed.
//! **Input:** `TenantUser` records.
//! **Output:** `TenantUser` records.
//! **Side effects:** Reads/writes the SQLite file at `PORTAL_DB_PATH`.
//! **Dependencies:** `sqlx`, `entities::TenantUser`.

use sqlx::SqlitePool;
use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;
use crate::entities::TenantUser::{TenantUser, TenantUserId};

pub struct TenantUserRepository {
    pool: SqlitePool,
}

impl TenantUserRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        tenant_id: TenantId,
        email: &str,
        password_hash: &str,
    ) -> Result<TenantUser, sqlx::Error> {
        let id = Uuid::new_v4();
        let created_at = chrono::Utc::now();

        sqlx::query(
            "INSERT INTO tenant_users (id, tenant_id, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(tenant_id.to_string())
        .bind(email)
        .bind(password_hash)
        .bind(created_at.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(TenantUser {
            id,
            tenant_id,
            email: email.to_string(),
            password_hash: password_hash.to_string(),
            created_at,
        })
    }

    pub async fn find_by_email(&self, email: &str) -> Result<Option<TenantUser>, sqlx::Error> {
        let row = sqlx::query_as::<_, TenantUserRow>(
            "SELECT id, tenant_id, email, password_hash, created_at FROM tenant_users WHERE email = ?",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(TenantUserRow::into_entity))
    }

    pub async fn email_exists(&self, email: &str) -> Result<bool, sqlx::Error> {
        Ok(self.find_by_email(email).await?.is_some())
    }

    pub async fn find_by_id(&self, id: TenantUserId) -> Result<Option<TenantUser>, sqlx::Error> {
        let row = sqlx::query_as::<_, TenantUserRow>(
            "SELECT id, tenant_id, email, password_hash, created_at FROM tenant_users WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(TenantUserRow::into_entity))
    }

    pub async fn update_password_hash(&self, id: TenantUserId, password_hash: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE tenant_users SET password_hash = ? WHERE id = ?")
            .bind(password_hash)
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct TenantUserRow {
    id: String,
    tenant_id: String,
    email: String,
    password_hash: String,
    created_at: String,
}

impl TenantUserRow {
    fn into_entity(self) -> TenantUser {
        TenantUser {
            id: Uuid::parse_str(&self.id).expect("stored id is always a valid UUID"),
            tenant_id: Uuid::parse_str(&self.tenant_id).expect("stored tenant_id is always a valid UUID"),
            email: self.email,
            password_hash: self.password_hash,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .expect("stored created_at is always valid RFC3339")
                .with_timezone(&chrono::Utc),
        }
    }
}
