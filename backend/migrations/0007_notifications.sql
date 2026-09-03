-- A durable record of every message published to a tenant, kept for the
-- tenant-portal notification bell — separate from `push_subscriptions`
-- (which only exists to route Web Push, and carries no history) so a
-- tenant can see what they received even without a browser ever
-- subscribing to push at all.
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created ON notifications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread ON notifications (tenant_id, read_at);
