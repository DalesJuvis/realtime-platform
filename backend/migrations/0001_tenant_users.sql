-- Portal login accounts, one per tenant's own user. Proven ownership of a
-- tenant at registration time (see PortalAuthService::register — the
-- caller must supply the tenant's real secret, the same one the admin API
-- hands out once at tenant creation), not admin-provisioned.
CREATE TABLE IF NOT EXISTS tenant_users (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users (tenant_id);
