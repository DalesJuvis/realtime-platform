//! # NotificationRepository
//!
//! **Action:** SQLite-backed storage of received-message notifications —
//! one row per message published to a tenant, regardless of whether
//! anyone was connected to see it live. Backs the tenant-portal
//! notification bell.
//! **Input:** `Notification` records.
//! **Output:** `Notification` records.
//! **Side effects:** Reads/writes the SQLite file at `PORTAL_DB_PATH`.
//! **Dependencies:** `sqlx`, `entities::ChannelKey`, `entities::Notification`.

use sqlx::SqlitePool;
use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;
use crate::entities::Notification::{Notification, NotificationDelivery};

pub struct NotificationRepository {
    pool: SqlitePool,
}

impl NotificationRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Called from `PushFallbackService::publish_and_fanout` for every
    /// successfully published message (PUB and UNICAST alike) — not just
    /// ones that missed a live subscriber, so this is a full received-
    /// message log, not only a "you were away" inbox. `delivery` records
    /// which path this particular message actually went out on (see
    /// `NotificationDelivery`'s doc comment).
    pub async fn insert(
        &self,
        tenant_id: TenantId,
        channel_id: &str,
        payload: &str,
        delivery: NotificationDelivery,
    ) -> Result<(), sqlx::Error> {
        let id = Uuid::new_v4();
        let created_at = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO notifications (id, tenant_id, channel_id, payload, delivery, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
        )
        .bind(id.to_string())
        .bind(tenant_id.to_string())
        .bind(channel_id)
        .bind(payload)
        .bind(delivery.as_str())
        .bind(created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Most recent first, capped at `limit` — the notification bell's feed.
    pub async fn list_for_tenant(&self, tenant_id: TenantId, limit: i64) -> Result<Vec<Notification>, sqlx::Error> {
        let rows = sqlx::query_as::<_, NotificationRow>(
            "SELECT id, tenant_id, channel_id, payload, delivery, created_at, read_at FROM notifications \
             WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(tenant_id.to_string())
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(NotificationRow::into_entity).collect())
    }

    /// `(realtime_count, push_count)` for this tenant — the Overview
    /// page's "Realtime messages"/"Push messages" tiles, sourced from the
    /// exact same rows the notification bell lists, so the two views can
    /// never drift out of sync with each other.
    pub async fn count_by_delivery(&self, tenant_id: TenantId) -> Result<(i64, i64), sqlx::Error> {
        let realtime: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND delivery = 'realtime'")
                .bind(tenant_id.to_string())
                .fetch_one(&self.pool)
                .await?;
        let push: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND delivery = 'push'")
                .bind(tenant_id.to_string())
                .fetch_one(&self.pool)
                .await?;
        Ok((realtime.0, push.0))
    }

    pub async fn unread_count(&self, tenant_id: TenantId) -> Result<i64, sqlx::Error> {
        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND read_at IS NULL")
                .bind(tenant_id.to_string())
                .fetch_one(&self.pool)
                .await?;
        Ok(count.0)
    }

    /// Idempotent by design: marking an already-read (or nonexistent, or
    /// another tenant's) notification read is a harmless no-op rather than
    /// an error the frontend would need to handle specially.
    pub async fn mark_read(&self, tenant_id: TenantId, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE notifications SET read_at = ? WHERE id = ? AND tenant_id = ? AND read_at IS NULL")
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(id.to_string())
            .bind(tenant_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn mark_all_read(&self, tenant_id: TenantId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE notifications SET read_at = ? WHERE tenant_id = ? AND read_at IS NULL")
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(tenant_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct NotificationRow {
    id: String,
    tenant_id: String,
    channel_id: String,
    payload: String,
    delivery: String,
    created_at: String,
    read_at: Option<String>,
}

impl NotificationRow {
    fn into_entity(self) -> Notification {
        Notification {
            id: Uuid::parse_str(&self.id).expect("stored id is always a valid UUID"),
            tenant_id: Uuid::parse_str(&self.tenant_id).expect("stored tenant_id is always a valid UUID"),
            channel_id: self.channel_id,
            payload: self.payload,
            delivery: NotificationDelivery::from_str(&self.delivery),
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .expect("stored created_at is always valid RFC3339")
                .with_timezone(&chrono::Utc),
            read_at: self.read_at.map(|s| {
                chrono::DateTime::parse_from_rfc3339(&s)
                    .expect("stored read_at is always valid RFC3339")
                    .with_timezone(&chrono::Utc)
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn insert_then_list_returns_most_recent_first() {
        let repo = NotificationRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();
        repo.insert(tenant, "orders:1", "first", NotificationDelivery::Realtime).await.unwrap();
        repo.insert(tenant, "orders:2", "second", NotificationDelivery::Realtime).await.unwrap();

        let list = repo.list_for_tenant(tenant, 10).await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].payload, "second");
        assert_eq!(list[1].payload, "first");
    }

    #[tokio::test]
    async fn list_is_scoped_to_tenant() {
        let repo = NotificationRepository::new(test_pool().await);
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();
        repo.insert(tenant_a, "orders:1", "a's message", NotificationDelivery::Realtime).await.unwrap();

        assert!(repo.list_for_tenant(tenant_b, 10).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn unread_count_reflects_read_state() {
        let repo = NotificationRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();
        repo.insert(tenant, "orders:1", "one", NotificationDelivery::Realtime).await.unwrap();
        repo.insert(tenant, "orders:2", "two", NotificationDelivery::Realtime).await.unwrap();
        assert_eq!(repo.unread_count(tenant).await.unwrap(), 2);

        let list = repo.list_for_tenant(tenant, 10).await.unwrap();
        repo.mark_read(tenant, list[0].id).await.unwrap();
        assert_eq!(repo.unread_count(tenant).await.unwrap(), 1);
    }

    #[tokio::test]
    async fn mark_read_does_not_leak_across_tenants() {
        let repo = NotificationRepository::new(test_pool().await);
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();
        repo.insert(tenant_a, "orders:1", "a's message", NotificationDelivery::Realtime).await.unwrap();
        let a_notification = repo.list_for_tenant(tenant_a, 10).await.unwrap().remove(0);

        repo.mark_read(tenant_b, a_notification.id).await.unwrap();
        assert_eq!(repo.unread_count(tenant_a).await.unwrap(), 1);
    }

    #[tokio::test]
    async fn mark_all_read_clears_the_unread_count() {
        let repo = NotificationRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();
        repo.insert(tenant, "orders:1", "one", NotificationDelivery::Realtime).await.unwrap();
        repo.insert(tenant, "orders:2", "two", NotificationDelivery::Realtime).await.unwrap();

        repo.mark_all_read(tenant).await.unwrap();
        assert_eq!(repo.unread_count(tenant).await.unwrap(), 0);
    }

    #[tokio::test]
    async fn count_by_delivery_splits_realtime_from_push() {
        let repo = NotificationRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();
        repo.insert(tenant, "orders:1", "one", NotificationDelivery::Realtime).await.unwrap();
        repo.insert(tenant, "orders:2", "two", NotificationDelivery::Push).await.unwrap();
        repo.insert(tenant, "orders:3", "three", NotificationDelivery::Push).await.unwrap();

        let (realtime, push) = repo.count_by_delivery(tenant).await.unwrap();
        assert_eq!(realtime, 1);
        assert_eq!(push, 2);
    }

    #[tokio::test]
    async fn count_by_delivery_is_scoped_to_tenant() {
        let repo = NotificationRepository::new(test_pool().await);
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();
        repo.insert(tenant_a, "orders:1", "a's message", NotificationDelivery::Push).await.unwrap();

        let (realtime, push) = repo.count_by_delivery(tenant_b).await.unwrap();
        assert_eq!(realtime, 0);
        assert_eq!(push, 0);
    }

    #[tokio::test]
    async fn list_for_tenant_round_trips_delivery() {
        let repo = NotificationRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();
        repo.insert(tenant, "orders:1", "one", NotificationDelivery::Push).await.unwrap();

        let list = repo.list_for_tenant(tenant, 10).await.unwrap();
        assert_eq!(list[0].delivery, NotificationDelivery::Push);
    }
}
