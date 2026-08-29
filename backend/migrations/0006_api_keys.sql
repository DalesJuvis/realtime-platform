-- Named, independently-revocable API key pairs — a real Stripe-style
-- "several valid keys at once" model, additive to (not a replacement for)
-- the tenant's own signup-issued primary secret in `tenant_secrets`: that
-- one stays exactly as-is (Settings' "Public key/Secret key", the
-- rotate-in-place flow), this table is for extra named pairs a tenant
-- generates for a specific server/app/environment and can revoke on its
-- own without affecting the others or the primary secret.
--
-- `public_key` is its own independently-generated identifier — never the
-- tenant_id itself (see ApiKeyRepository's own doc comment for why that
-- was wrong: reusing tenant_id as a second "key" field is indistinguishable
-- from a bug, not a real credential). `secret` is stored in plaintext,
-- matching `tenant_secrets.secret`'s existing convention in this same
-- database — it has to be recoverable to sign/verify HMACs with, unlike a
-- password hash.
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL UNIQUE,
    secret TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys (tenant_id);
