//! # PushSubscriptionRepository
//!
//! **Action:** SQLite-backed storage of browser Web Push subscriptions,
//! plus matching a published channel against every subscription's
//! channel-interest list — the `push_subscriptions` counterpart of how
//! `ChannelRouterService` matches a live WS `SUB` pattern.
//! **Input:** `PushSubscription` records; `(tenant_id, channel_id)` to match.
//! **Output:** `PushSubscription` records.
//! **Side effects:** Reads/writes the SQLite file at `PORTAL_DB_PATH`.
//! **Dependencies:** `sqlx`, `entities::PushSubscription`, `ChannelRouterService::glob_match`.

use sqlx::SqlitePool;

use crate::entities::ChannelKey::TenantId;
use crate::entities::PushSubscription::PushSubscription;
use crate::entities::PushSubscriptionSummary::PushSubscriptionSummary;
use crate::modules::realtime::services::ChannelRouterService::glob_match;

pub struct PushSubscriptionRepository {
    pool: SqlitePool,
}

impl PushSubscriptionRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Registers (or, keyed by `endpoint`, re-registers — a browser may
    /// resubscribe with rotated keys) one subscription.
    pub async fn upsert(&self, sub: &PushSubscription) -> Result<(), sqlx::Error> {
        let channels_json = serde_json::to_string(&sub.channels).unwrap_or_else(|_| "[]".to_string());
        let created_at = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO push_subscriptions (endpoint, tenant_id, sub, p256dh_key, auth_key, channels, created_at, device_label)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(endpoint) DO UPDATE SET
                tenant_id = excluded.tenant_id,
                sub = excluded.sub,
                p256dh_key = excluded.p256dh_key,
                auth_key = excluded.auth_key,
                channels = excluded.channels,
                device_label = excluded.device_label",
        )
        .bind(&sub.endpoint)
        .bind(sub.tenant_id.to_string())
        .bind(&sub.sub)
        .bind(&sub.p256dh_key)
        .bind(&sub.auth_key)
        .bind(channels_json)
        .bind(created_at)
        .bind(&sub.device_label)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// One device, scoped to `tenant_id` so a portal session can never
    /// read (and then push-test) another tenant's subscription — the
    /// "send test notification" path's lookup, needs the full entity
    /// (crypto keys included) unlike `list_for_tenant`'s summary view.
    pub async fn find_one(&self, tenant_id: TenantId, endpoint: &str) -> Result<Option<PushSubscription>, sqlx::Error> {
        let row = sqlx::query_as::<_, SubscriptionRow>(
            "SELECT endpoint, sub, p256dh_key, auth_key, channels, device_label FROM push_subscriptions \
             WHERE tenant_id = ? AND endpoint = ?",
        )
        .bind(tenant_id.to_string())
        .bind(endpoint)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| PushSubscription {
            endpoint: row.endpoint,
            tenant_id,
            sub: row.sub,
            p256dh_key: row.p256dh_key,
            auth_key: row.auth_key,
            channels: serde_json::from_str(&row.channels).unwrap_or_default(),
            device_label: row.device_label,
        }))
    }

    /// Every device subscribed for `tenant_id`, most recently registered
    /// first — the tenant-portal device list's source. Unlike
    /// `find_matching`, not filtered by channel: this is "every device
    /// this tenant has, across every `sub`", not "who gets this message".
    pub async fn list_for_tenant(&self, tenant_id: TenantId) -> Result<Vec<PushSubscriptionSummary>, sqlx::Error> {
        let rows = sqlx::query_as::<_, SummaryRow>(
            "SELECT endpoint, sub, channels, device_label, created_at FROM push_subscriptions \
             WHERE tenant_id = ? ORDER BY created_at DESC",
        )
        .bind(tenant_id.to_string())
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| PushSubscriptionSummary {
                endpoint: row.endpoint,
                sub: row.sub,
                channels: serde_json::from_str(&row.channels).unwrap_or_default(),
                device_label: row.device_label,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.created_at)
                    .expect("stored created_at is always valid RFC3339")
                    .with_timezone(&chrono::Utc),
            })
            .collect())
    }

    /// Deletes a subscription by `endpoint`, scoped to `tenant_id` so one
    /// tenant's client token can never delete another tenant's row.
    pub async fn delete(&self, tenant_id: TenantId, endpoint: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM push_subscriptions WHERE endpoint = ? AND tenant_id = ?")
            .bind(endpoint)
            .bind(tenant_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Every subscription of `tenant_id` whose stored channel list matches
    /// `channel_id` (exact, or a stored `orders:*`-style pattern) — the
    /// push-fallback counterpart of a live WS `SUB` match.
    ///
    /// Filters in Rust after a per-tenant fetch rather than in SQL: tenant
    /// subscription counts are expected to stay small (one row per
    /// browser profile, not per message), and reusing
    /// `ChannelRouterService::glob_match` exactly is worth more than a
    /// hand-translated SQL `LIKE` that could silently drift out of sync
    /// with the WS-side matching semantics.
    pub async fn find_matching(&self, tenant_id: TenantId, channel_id: &str) -> Result<Vec<PushSubscription>, sqlx::Error> {
        let rows = sqlx::query_as::<_, SubscriptionRow>(
            "SELECT endpoint, sub, p256dh_key, auth_key, channels, device_label FROM push_subscriptions WHERE tenant_id = ?",
        )
        .bind(tenant_id.to_string())
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let channels: Vec<String> = serde_json::from_str(&row.channels).unwrap_or_default();
                channels
                    .iter()
                    .any(|pattern| pattern == channel_id || glob_match(pattern, channel_id))
                    .then_some(PushSubscription {
                        endpoint: row.endpoint,
                        tenant_id,
                        sub: row.sub,
                        p256dh_key: row.p256dh_key,
                        auth_key: row.auth_key,
                        channels,
                        device_label: row.device_label,
                    })
            })
            .collect())
    }
}

#[derive(sqlx::FromRow)]
struct SubscriptionRow {
    endpoint: String,
    sub: String,
    p256dh_key: String,
    auth_key: String,
    channels: String,
    device_label: Option<String>,
}

#[derive(sqlx::FromRow)]
struct SummaryRow {
    endpoint: String,
    sub: String,
    channels: String,
    device_label: Option<String>,
    created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    async fn test_pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    fn sample(tenant_id: TenantId, endpoint: &str, channels: Vec<&str>) -> PushSubscription {
        PushSubscription {
            endpoint: endpoint.to_string(),
            tenant_id,
            sub: "user-1".to_string(),
            p256dh_key: "p256dh".to_string(),
            auth_key: "auth".to_string(),
            channels: channels.into_iter().map(String::from).collect(),
            device_label: None,
        }
    }

    fn sample_device(tenant_id: TenantId, endpoint: &str, sub: &str, device_label: &str) -> PushSubscription {
        PushSubscription {
            endpoint: endpoint.to_string(),
            tenant_id,
            sub: sub.to_string(),
            p256dh_key: "p256dh".to_string(),
            auth_key: "auth".to_string(),
            channels: vec!["*".to_string()],
            device_label: Some(device_label.to_string()),
        }
    }

    #[tokio::test]
    async fn upsert_then_find_matching_exact_channel() {
        let repo = PushSubscriptionRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();
        repo.upsert(&sample(tenant, "https://push.example/1", vec!["orders:42"])).await.unwrap();

        let matches = repo.find_matching(tenant, "orders:42").await.unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].endpoint, "https://push.example/1");

        let no_match = repo.find_matching(tenant, "orders:43").await.unwrap();
        assert!(no_match.is_empty());
    }

    #[tokio::test]
    async fn find_matching_respects_wildcard_patterns() {
        let repo = PushSubscriptionRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();
        repo.upsert(&sample(tenant, "https://push.example/1", vec!["orders:*"])).await.unwrap();

        let matches = repo.find_matching(tenant, "orders:99").await.unwrap();
        assert_eq!(matches.len(), 1);
    }

    #[tokio::test]
    async fn find_matching_is_scoped_to_tenant() {
        let repo = PushSubscriptionRepository::new(test_pool().await);
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();
        repo.upsert(&sample(tenant_a, "https://push.example/1", vec!["orders:42"])).await.unwrap();

        let matches = repo.find_matching(tenant_b, "orders:42").await.unwrap();
        assert!(matches.is_empty());
    }

    #[tokio::test]
    async fn upsert_is_idempotent_by_endpoint() {
        let repo = PushSubscriptionRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();
        repo.upsert(&sample(tenant, "https://push.example/1", vec!["a"])).await.unwrap();
        repo.upsert(&sample(tenant, "https://push.example/1", vec!["b"])).await.unwrap();

        assert!(repo.find_matching(tenant, "a").await.unwrap().is_empty());
        assert_eq!(repo.find_matching(tenant, "b").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn same_sub_keeps_one_row_per_device() {
        let repo = PushSubscriptionRepository::new(test_pool().await);
        let tenant = Uuid::new_v4();

        // Same `sub`, three different devices — each has its own endpoint,
        // so each must land as its own row, none clobbering the others.
        repo.upsert(&sample_device(tenant, "https://fcm.googleapis.com/android", "user-1", "Android Phone"))
            .await
            .unwrap();
        repo.upsert(&sample_device(tenant, "https://fcm.googleapis.com/chrome-desktop", "user-1", "Chrome on Windows"))
            .await
            .unwrap();
        repo.upsert(&sample_device(tenant, "https://web.push.apple.com/iphone", "user-1", "Safari on iPhone"))
            .await
            .unwrap();

        let matches = repo.find_matching(tenant, "anything").await.unwrap();
        assert_eq!(matches.len(), 3, "all three devices must coexist for the same sub");

        let labels: std::collections::HashSet<_> = matches.iter().filter_map(|s| s.device_label.clone()).collect();
        assert_eq!(
            labels,
            std::collections::HashSet::from([
                "Android Phone".to_string(),
                "Chrome on Windows".to_string(),
                "Safari on iPhone".to_string(),
            ])
        );
    }

    #[tokio::test]
    async fn find_one_is_scoped_to_tenant_and_endpoint() {
        let repo = PushSubscriptionRepository::new(test_pool().await);
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();
        repo.upsert(&sample_device(tenant_a, "https://fcm.googleapis.com/android", "user-1", "Android Phone"))
            .await
            .unwrap();

        let found = repo.find_one(tenant_a, "https://fcm.googleapis.com/android").await.unwrap();
        assert_eq!(found.unwrap().device_label.as_deref(), Some("Android Phone"));

        assert!(repo.find_one(tenant_b, "https://fcm.googleapis.com/android").await.unwrap().is_none());
        assert!(repo.find_one(tenant_a, "https://fcm.googleapis.com/nonexistent").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn list_for_tenant_returns_every_device_scoped_to_tenant() {
        let repo = PushSubscriptionRepository::new(test_pool().await);
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();
        repo.upsert(&sample_device(tenant_a, "https://fcm.googleapis.com/android", "user-1", "Android Phone"))
            .await
            .unwrap();
        repo.upsert(&sample_device(tenant_a, "https://web.push.apple.com/iphone", "user-1", "Safari on iPhone"))
            .await
            .unwrap();
        repo.upsert(&sample_device(tenant_b, "https://fcm.googleapis.com/other-tenant", "user-2", "Other Tenant Phone"))
            .await
            .unwrap();

        let list = repo.list_for_tenant(tenant_a).await.unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().all(|s| s.device_label.is_some()));
    }

    #[tokio::test]
    async fn delete_requires_matching_tenant() {
        let repo = PushSubscriptionRepository::new(test_pool().await);
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();
        repo.upsert(&sample(tenant_a, "https://push.example/1", vec!["a"])).await.unwrap();

        repo.delete(tenant_b, "https://push.example/1").await.unwrap();
        assert_eq!(repo.find_matching(tenant_a, "a").await.unwrap().len(), 1);

        repo.delete(tenant_a, "https://push.example/1").await.unwrap();
        assert!(repo.find_matching(tenant_a, "a").await.unwrap().is_empty());
    }
}
