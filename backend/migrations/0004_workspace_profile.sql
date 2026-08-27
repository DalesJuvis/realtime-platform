-- Optional display profile for a tenant's workspace — name/website/logo
-- shown in the portal UI (Settings → Profile). Entirely cosmetic: nothing
-- else in the backend reads this table. `logo_data_uri` stores the
-- uploaded image inline (bounded to 2 MB by UploadLogoUseCase before it
-- ever reaches SQL) rather than on a filesystem/object store — simplest
-- thing that works at this size, revisit if logos get bigger than that.
CREATE TABLE IF NOT EXISTS workspace_profile (
    tenant_id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    website_url TEXT,
    logo_data_uri TEXT,
    updated_at TEXT NOT NULL
);
