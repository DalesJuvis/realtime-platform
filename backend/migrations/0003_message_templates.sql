-- Reusable message bodies for the tenant workspace's Templating page —
-- `{{variable}}` placeholders are a client-side (frontend) convention
-- only; the backend stores/returns `body` as opaque text.
CREATE TABLE IF NOT EXISTS message_templates (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_templates_tenant_id ON message_templates (tenant_id);
