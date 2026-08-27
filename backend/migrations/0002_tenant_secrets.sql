-- Durable copy of each self-serve tenant's current HMAC secret. Closes a
-- real gap: `TokenService`'s in-memory `TenantSecretRepository` forgets
-- every secret on restart except the env-var-provisioned demo tenant —
-- `main.rs` reloads this table into it at boot so a self-serve tenant's
-- key pair (see `modules::portal::dto::KeyPairDto`) survives a restart,
-- same as their `tenant_users` row already does.
CREATE TABLE IF NOT EXISTS tenant_secrets (
    tenant_id TEXT PRIMARY KEY NOT NULL,
    secret TEXT NOT NULL,
    rotated_at TEXT NOT NULL
);
