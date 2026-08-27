//! # WorkspaceProfileRepository
//!
//! **Action:** SQLite-backed storage of a tenant's optional display
//! profile (name/website/logo).
//! **Input:** `WorkspaceProfile` records.
//! **Output:** `WorkspaceProfile` records.
//! **Side effects:** Reads/writes the SQLite file at `PORTAL_DB_PATH`.
//! **Dependencies:** `sqlx`, `entities::WorkspaceProfile`.

use sqlx::SqlitePool;

use crate::entities::ChannelKey::TenantId;
use crate::entities::WorkspaceProfile::WorkspaceProfile;

pub struct WorkspaceProfileRepository {
    pool: SqlitePool,
}

impl WorkspaceProfileRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, tenant_id: TenantId) -> Result<WorkspaceProfile, sqlx::Error> {
        let row = sqlx::query_as::<_, ProfileRow>(
            "SELECT name, website_url, logo_data_uri FROM workspace_profile WHERE tenant_id = ?",
        )
        .bind(tenant_id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        Ok(match row {
            Some(r) => WorkspaceProfile {
                tenant_id,
                name: r.name,
                website_url: r.website_url,
                logo_data_uri: r.logo_data_uri,
            },
            None => WorkspaceProfile { tenant_id, ..Default::default() },
        })
    }

    /// Upserts only the given fields, leaving the rest of the row
    /// untouched — `None` means "don't change this field", not "clear it"
    /// (matches `UpdateProfileDto`'s partial-update semantics).
    pub async fn update(&self, tenant_id: TenantId, name: Option<&str>, website_url: Option<&str>) -> Result<(), sqlx::Error> {
        let updated_at = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO workspace_profile (tenant_id, name, website_url, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(tenant_id) DO UPDATE SET
                name = COALESCE(?, workspace_profile.name),
                website_url = COALESCE(?, workspace_profile.website_url),
                updated_at = excluded.updated_at",
        )
        .bind(tenant_id.to_string())
        .bind(name)
        .bind(website_url)
        .bind(&updated_at)
        .bind(name)
        .bind(website_url)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_logo(&self, tenant_id: TenantId, logo_data_uri: &str) -> Result<(), sqlx::Error> {
        let updated_at = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO workspace_profile (tenant_id, logo_data_uri, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(tenant_id) DO UPDATE SET logo_data_uri = excluded.logo_data_uri, updated_at = excluded.updated_at",
        )
        .bind(tenant_id.to_string())
        .bind(logo_data_uri)
        .bind(updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct ProfileRow {
    name: Option<String>,
    website_url: Option<String>,
    logo_data_uri: Option<String>,
}
