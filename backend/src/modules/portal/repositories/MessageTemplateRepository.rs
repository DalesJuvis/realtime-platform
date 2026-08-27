//! # MessageTemplateRepository
//!
//! **Action:** SQLite-backed storage of reusable message bodies for the
//! tenant workspace's Templating page.
//! **Input:** `MessageTemplate` records.
//! **Output:** `MessageTemplate` records.
//! **Side effects:** Reads/writes the SQLite file at `PORTAL_DB_PATH`.
//! **Dependencies:** `sqlx`, `entities::ChannelKey`, `entities::MessageTemplate`.

use sqlx::SqlitePool;
use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;
use crate::entities::MessageTemplate::MessageTemplate;

pub struct MessageTemplateRepository {
    pool: SqlitePool,
}

impl MessageTemplateRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, tenant_id: TenantId, name: &str, body: &str) -> Result<MessageTemplate, sqlx::Error> {
        let id = Uuid::new_v4();
        let now = chrono::Utc::now();

        sqlx::query(
            "INSERT INTO message_templates (id, tenant_id, name, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(tenant_id.to_string())
        .bind(name)
        .bind(body)
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(MessageTemplate {
            id,
            tenant_id,
            name: name.to_string(),
            body: body.to_string(),
            created_at: now,
            updated_at: now,
        })
    }

    pub async fn list_for_tenant(&self, tenant_id: TenantId) -> Result<Vec<MessageTemplate>, sqlx::Error> {
        let rows = sqlx::query_as::<_, MessageTemplateRow>(
            "SELECT id, tenant_id, name, body, created_at, updated_at FROM message_templates \
             WHERE tenant_id = ? ORDER BY updated_at DESC",
        )
        .bind(tenant_id.to_string())
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(MessageTemplateRow::into_entity).collect())
    }

    /// Returns `true` if a row belonging to `tenant_id` was actually
    /// updated — the caller must treat `false` as "not found or not
    /// yours" (never leak whether a foreign tenant's template ID exists).
    pub async fn update(&self, tenant_id: TenantId, id: Uuid, name: &str, body: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE message_templates SET name = ?, body = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
        )
        .bind(name)
        .bind(body)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(id.to_string())
        .bind(tenant_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn delete(&self, tenant_id: TenantId, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM message_templates WHERE id = ? AND tenant_id = ?")
            .bind(id.to_string())
            .bind(tenant_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

#[derive(sqlx::FromRow)]
struct MessageTemplateRow {
    id: String,
    tenant_id: String,
    name: String,
    body: String,
    created_at: String,
    updated_at: String,
}

impl MessageTemplateRow {
    fn into_entity(self) -> MessageTemplate {
        MessageTemplate {
            id: Uuid::parse_str(&self.id).expect("stored id is always a valid UUID"),
            tenant_id: Uuid::parse_str(&self.tenant_id).expect("stored tenant_id is always a valid UUID"),
            name: self.name,
            body: self.body,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .expect("stored created_at is always valid RFC3339")
                .with_timezone(&chrono::Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)
                .expect("stored updated_at is always valid RFC3339")
                .with_timezone(&chrono::Utc),
        }
    }
}
