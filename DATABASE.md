# database.md — Database Architecture & Standards

> Applies to all database engines used in the stack:
> **PostgreSQL** (via Supabase / SQLModel / Laravel), **SQLite** (local/cache), **Firebase Firestore** (document store).
> These rules enforce modularity, scalability, traceability, and CPU optimization.

---

## 1. Core Philosophy

- **Modulable** — each domain owns its tables; cross-domain access is through views or APIs, never direct joins across domain boundaries in application code.
- **Scalable** — schema is designed for horizontal partitioning and read replica routing from day one.
- **Traceable** — every table carries audit columns; every destructive action has a trigger.
- **CPU-aware** — complex JOIN queries are never run ad-hoc; they live in Views or Materialized Views.

---

## 2. Primary Keys — UUID Only

- **All tables use UUID v7** as primary key (`id`).
- UUID v7 is preferred over v4: time-ordered, index-friendly, avoids hot-spot fragmentation on insert.
- Never use serial integers or auto-increment as primary keys.
- The column is always named `id`.

```sql
-- PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ...
);
```

> For UUID v7 (time-ordered), use the `uuid_generate_v7()` extension or generate at application level.
> In SQLModel (Python): `Field(default_factory=uuid7, primary_key=True)`.
> In Laravel: `$table->uuid('id')->primary(); useUniqueIds();`.

---

## 3. Foreign Key Naming Convention

All foreign key columns follow the pattern:

```
{referenced_table_singular}_{referenced_column_name}
```

**Examples:**

| References              | Column name in child table   |
|-------------------------|------------------------------|
| `users.id`              | `user_id`                    |
| `roles.id`              | `role_id`                    |
| `organizations.id`      | `organization_id`            |
| `documents.slug`        | `document_slug`              |
| `categories.id` (x2)   | `parent_category_id`, `child_category_id` |

**Rules:**
- FK columns are always **explicitly declared** with `REFERENCES`, `ON DELETE`, and `ON UPDATE` actions.
- Always index FK columns: `CREATE INDEX ON orders(user_id);`
- `ON DELETE` policy must be intentional — never left as default:

| Relationship         | Policy                  |
|----------------------|-------------------------|
| Child owned by parent| `ON DELETE CASCADE`     |
| Child references parent (loose) | `ON DELETE SET NULL` |
| Critical reference   | `ON DELETE RESTRICT`    |

```sql
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    status_id       UUID NOT NULL REFERENCES order_statuses(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_orders_user_id         ON orders(user_id);
CREATE INDEX idx_orders_organization_id ON orders(organization_id);
CREATE INDEX idx_orders_status_id       ON orders(status_id);
```

---

## 4. Mandatory Audit Columns

Every table (except pure join/pivot tables) must include:

```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
deleted_at  TIMESTAMPTZ                          -- soft delete, NULL = active
```

For tables that require full change history, add:

```sql
created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
```

**Soft delete is the default** — hard delete only when legally required (GDPR erasure requests).
Queries must always filter `WHERE deleted_at IS NULL` unless explicitly requesting deleted records.

---

## 5. Triggers

Triggers are **required** in the following cases and **recommended** in others.

### 5.1 Required Triggers

#### `updated_at` Auto-update (all tables)
```sql
-- Reusable function
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
```

#### Audit Log — Critical Tables
For tables holding sensitive data (`users`, `auth_tokens`, `payments`, `roles`), log every change:

```sql
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name  TEXT NOT NULL,
    row_id      UUID NOT NULL,
    action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data    JSONB,
    new_data    JSONB,
    changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs(table_name, row_id, action, old_data, new_data)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD)::JSONB END,
        CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW)::JSONB END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply to sensitive tables
CREATE TRIGGER trg_users_audit
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
```

#### Soft Delete Guard
Prevent hard DELETE on protected tables — convert to soft delete:

```sql
CREATE OR REPLACE FUNCTION fn_soft_delete_guard()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET deleted_at = NOW() WHERE id = OLD.id;
    RETURN NULL; -- cancel the actual DELETE
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_soft_delete
    BEFORE DELETE ON users
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL)
    EXECUTE FUNCTION fn_soft_delete_guard();
```

### 5.2 Recommended Triggers

#### Cascade Soft Delete
When a parent is soft-deleted, propagate to owned children:

```sql
CREATE OR REPLACE FUNCTION fn_cascade_soft_delete_orders()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE orders SET deleted_at = NEW.deleted_at WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_cascade_soft_delete
    AFTER UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_cascade_soft_delete_orders();
```

#### Computed Column Sync
Keep denormalized/computed fields in sync automatically:

```sql
-- Example: keep orders.total_amount in sync with order_items
CREATE OR REPLACE FUNCTION fn_sync_order_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE orders
    SET total_amount = (
        SELECT COALESCE(SUM(quantity * unit_price), 0)
        FROM order_items
        WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
    )
    WHERE id = COALESCE(NEW.order_id, OLD.order_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_sync_total
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION fn_sync_order_total();
```

#### Token Expiry Cleanup
Auto-nullify expired tokens without a cron job:

```sql
CREATE OR REPLACE FUNCTION fn_expire_tokens()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE auth_tokens SET revoked_at = NOW()
    WHERE expires_at < NOW() AND revoked_at IS NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. Views

Use **Views** for any read query involving 2+ table JOINs that is used in more than one place.

### 6.1 Naming Convention

```
v_{resource}_{description}
```

Examples: `v_users_with_roles`, `v_orders_summary`, `v_products_active`.

### 6.2 Rules

- Views are **read-only** from application code — no `INSERT`/`UPDATE` through views.
- Views live in `database/views/` as `.sql` files, versioned in migration history.
- Every view file has a header comment (mirrors `view_sql` rules from RULES.md §13).
- Views that filter soft-deleted records must include `WHERE deleted_at IS NULL` explicitly.

### 6.3 Examples

```sql
-- # v_users_with_roles.sql
--
-- Action  : Returns active users joined with their primary role.
-- Tables  : users, user_roles, roles
-- Returns : id, email, full_name, role_name, role_slug, created_at
-- Version : 1

CREATE OR REPLACE VIEW v_users_with_roles AS
SELECT
    u.id,
    u.email,
    u.full_name,
    r.name        AS role_name,
    r.slug        AS role_slug,
    u.created_at
FROM users u
INNER JOIN user_roles ur ON ur.user_id = u.id
INNER JOIN roles r       ON r.id = ur.role_id
WHERE u.deleted_at IS NULL
  AND r.deleted_at IS NULL;
```

```sql
-- # v_orders_summary.sql
--
-- Action  : Returns orders with customer info, item count, and total.
-- Tables  : orders, users, order_items, order_statuses
-- Returns : order_id, user_email, status, item_count, total_amount, created_at
-- Version : 1

CREATE OR REPLACE VIEW v_orders_summary AS
SELECT
    o.id              AS order_id,
    u.email           AS user_email,
    os.label          AS status,
    COUNT(oi.id)      AS item_count,
    o.total_amount,
    o.created_at
FROM orders o
INNER JOIN users u          ON u.id = o.user_id
INNER JOIN order_statuses os ON os.id = o.status_id
LEFT  JOIN order_items oi   ON oi.order_id = o.id
WHERE o.deleted_at IS NULL
GROUP BY o.id, u.email, os.label, o.total_amount, o.created_at;
```

---

## 7. Materialized Views

Use **Materialized Views** when:
- The query involves aggregations, multiple JOINs, or window functions.
- The data does not need to be real-time (tolerable staleness: seconds to minutes).
- The query is called frequently and puts measurable CPU load on the database.

### 7.1 Naming Convention

```
mv_{resource}_{description}
```

Examples: `mv_dashboard_stats`, `mv_products_search_index`, `mv_revenue_by_month`.

### 7.2 Rules

- Every materialized view has a **refresh strategy** defined: `MANUAL`, `SCHEDULED`, or `TRIGGER`.
- Refresh is **CONCURRENTLY** whenever possible (no table lock during refresh).
- A unique index is required on each materialized view to enable `REFRESH CONCURRENTLY`.
- Refresh is triggered by the application or a pg_cron job — never inline in a request.
- Document the staleness tolerance in the file header.

### 7.3 Refresh Strategies

| Strategy    | When to use                                     | Mechanism                         |
|-------------|-------------------------------------------------|-----------------------------------|
| `MANUAL`    | Admin dashboards, reports                       | Called explicitly via API action  |
| `SCHEDULED` | Analytics, stats updated periodically           | `pg_cron` or external scheduler   |
| `TRIGGER`   | Near-real-time data (after INSERT/UPDATE/DELETE) | Trigger calls refresh function    |

### 7.4 Examples

```sql
-- # mv_dashboard_stats.sql
--
-- Action  : Pre-aggregated stats for the admin dashboard.
-- Tables  : users, orders, order_items, payments
-- Refresh : SCHEDULED every 5 minutes via pg_cron
-- Staleness tolerance: 5 minutes
-- Version : 1

CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT
    COUNT(DISTINCT u.id)                                    AS total_users,
    COUNT(DISTINCT o.id)                                    AS total_orders,
    COALESCE(SUM(o.total_amount), 0)                       AS total_revenue,
    COALESCE(AVG(o.total_amount), 0)                       AS avg_order_value,
    COUNT(DISTINCT u.id) FILTER (
        WHERE u.created_at >= NOW() - INTERVAL '30 days'
    )                                                       AS new_users_30d
FROM users u
LEFT JOIN orders o ON o.user_id = u.id AND o.deleted_at IS NULL
WHERE u.deleted_at IS NULL
WITH DATA;

CREATE UNIQUE INDEX idx_mv_dashboard_stats ON mv_dashboard_stats((TRUE));

-- Refresh (run via pg_cron or scheduler):
-- SELECT cron.schedule('refresh-dashboard', '*/5 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats');
```

```sql
-- # mv_products_search_index.sql
--
-- Action  : Full-text search index across products with category and brand.
-- Tables  : products, categories, brands
-- Refresh : TRIGGER after INSERT/UPDATE on products
-- Staleness tolerance: near-real-time
-- Version : 1

CREATE MATERIALIZED VIEW mv_products_search_index AS
SELECT
    p.id,
    p.name,
    p.slug,
    p.price,
    c.name          AS category_name,
    b.name          AS brand_name,
    to_tsvector('english',
        p.name || ' ' || COALESCE(p.description, '') || ' ' ||
        COALESCE(c.name, '') || ' ' || COALESCE(b.name, '')
    )               AS search_vector
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN brands b     ON b.id = p.brand_id
WHERE p.deleted_at IS NULL
WITH DATA;

CREATE UNIQUE INDEX idx_mv_products_search_id     ON mv_products_search_index(id);
CREATE INDEX        idx_mv_products_search_vector ON mv_products_search_index
    USING GIN (search_vector);

-- Trigger-based refresh
CREATE OR REPLACE FUNCTION fn_refresh_products_search_index()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_products_search_index;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_refresh_search
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH STATEMENT EXECUTE FUNCTION fn_refresh_products_search_index();
```

---

## 8. Table Partitioning

Partition tables when a single table is expected to exceed **10 million rows** or when queries systematically filter on a specific column (date range, status, tenant ID).

### 8.1 When to Partition

| Signal                                          | Partition Strategy          |
|-------------------------------------------------|-----------------------------|
| Time-series data (logs, events, analytics)      | Range on `created_at`       |
| Multi-tenant SaaS                               | List on `organization_id`   |
| Status-based filtering (active vs archived)     | List on `status`            |
| High-volume append-only tables                  | Range by month/year         |

### 8.2 Rules

- Partition key must be included in every query's `WHERE` clause — enforce via query review.
- The parent table is **never queried directly** from application code — always via a named view or explicit partition.
- Old partitions can be detached and archived independently without locking the parent table.
- Include partition key in the primary key when required by PostgreSQL: `PRIMARY KEY (id, created_at)`.

### 8.3 Example — Events Table (Range by Month)

```sql
-- Parent table
CREATE TABLE events (
    id              UUID NOT NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_events_user_id    ON events(user_id);
CREATE INDEX idx_events_event_type ON events(event_type);

-- Monthly partitions
CREATE TABLE events_2026_01 PARTITION OF events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE events_2026_02 PARTITION OF events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Auto-create future partitions via pg_cron or migration script
```

### 8.4 Example — Multi-Tenant (List by organization)

```sql
CREATE TABLE documents (
    id              UUID NOT NULL,
    organization_id UUID NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    PRIMARY KEY (id, organization_id)
) PARTITION BY LIST (organization_id);

-- One partition per tenant (created dynamically on org creation via trigger)
CREATE TABLE documents_org_<uuid> PARTITION OF documents
    FOR VALUES IN ('<uuid>');
```

---

## 9. Index Strategy

- **Always index**: FK columns, columns used in `WHERE`, `ORDER BY`, `GROUP BY` in frequent queries.
- **Partial indexes** for filtered queries (e.g., active records only):
```sql
CREATE INDEX idx_users_active_email ON users(email) WHERE deleted_at IS NULL;
```
- **Composite indexes**: column order matters — most selective column first.
- **GIN indexes** for JSONB and full-text search columns.
- **No over-indexing**: each index has a write cost — justify every index with a query.
- Index naming: `idx_{table}_{columns}` (e.g., `idx_orders_user_id_created_at`).

---

## 10. Module Boundaries

Each domain module owns its tables. Cross-domain data access rules:

```
┌─────────────────────────────────────────────────────────┐
│  auth        │ users, auth_tokens, roles, user_roles    │
│  billing     │ payments, subscriptions, invoices        │
│  catalog     │ products, categories, brands             │
│  orders      │ orders, order_items, order_statuses      │
│  analytics   │ events (partitioned), mv_* views         │
│  files       │ uploads, file_metadata                   │
└─────────────────────────────────────────────────────────┘
```

**Rules:**
- Module A's Repository **never** directly JOINs into Module B's tables in application code.
- Cross-module reads use a shared **View** defined in `database/views/cross/`.
- Cross-module writes go through the target module's UseCase — never a direct INSERT.

---

## 11. Migration Rules

- Migrations are **sequential, irreversible, and always forward** — no destructive rollbacks in production.
- Naming: `{timestamp}_{action}_{resource}.sql` (e.g., `20260615_create_users.sql`).
- Every migration file includes: purpose comment, `UP` block, and a documented `DOWN` block (for dev only).
- Dropping a column: first deploy makes it nullable + unused, second deploy drops it (two-phase).
- Adding a NOT NULL column: always provide a `DEFAULT` or backfill in the same migration.
- Migrations are run automatically on deploy in staging; **manually approved** in production.

---

## 12. Naming Summary

| Object              | Convention                              | Example                          |
|---------------------|-----------------------------------------|----------------------------------|
| Table               | `snake_case` plural                     | `order_items`                    |
| Column              | `snake_case`                            | `total_amount`                   |
| Primary key         | `id` (UUID)                             | `id`                             |
| Foreign key         | `{ref_table_singular}_{ref_column}`     | `user_id`, `organization_id`     |
| Index               | `idx_{table}_{columns}`                 | `idx_orders_user_id`             |
| View                | `v_{resource}_{description}`            | `v_users_with_roles`             |
| Materialized view   | `mv_{resource}_{description}`           | `mv_dashboard_stats`             |
| Trigger             | `trg_{table}_{action}`                  | `trg_users_updated_at`           |
| Trigger function    | `fn_{description}`                      | `fn_set_updated_at`              |
| Partition           | `{table}_{partition_key_value}`         | `events_2026_01`                 |
| Migration file      | `{timestamp}_{action}_{resource}.sql`   | `20260615_create_users.sql`      |

---

---

## 13. PostgreSQL Extensions

Activate all extensions at schema bootstrap. Each extension lives in its own migration file.

### 13.1 Required Extensions

```sql
-- # 20260101_extensions.sql
-- Action: Bootstrap all required PostgreSQL extensions.

-- UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";           -- gen_random_uuid(), encrypt()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";          -- uuid_generate_v4/v7

-- Full-text & fuzzy search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";            -- trigram similarity (fuzzy search)
CREATE EXTENSION IF NOT EXISTS "unaccent";           -- accent-insensitive search

-- Vector / AI embeddings
CREATE EXTENSION IF NOT EXISTS "vector";             -- pgvector: store & query LLM embeddings

-- Geospatial
CREATE EXTENSION IF NOT EXISTS "postgis";            -- geometry, geography, spatial indexes
CREATE EXTENSION IF NOT EXISTS "postgis_topology";   -- topology support

-- Math & statistics
CREATE EXTENSION IF NOT EXISTS "tablefunc";          -- crosstab / pivot tables
CREATE EXTENSION IF NOT EXISTS "cube";               -- multi-dimensional distance
CREATE EXTENSION IF NOT EXISTS "earthdistance";      -- lat/lng distance (requires cube)

-- Scheduling
CREATE EXTENSION IF NOT EXISTS "pg_cron";            -- cron jobs inside Postgres

-- Performance & monitoring
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- query performance tracking
CREATE EXTENSION IF NOT EXISTS "btree_gin";          -- GIN index on scalar types
CREATE EXTENSION IF NOT EXISTS "btree_gist";         -- GIST index on scalar types

-- JSON validation
CREATE EXTENSION IF NOT EXISTS "pg_jsonschema";      -- JSON Schema validation on JSONB columns
```

### 13.2 Extension Usage Rules

- Extensions are enabled in a single dedicated migration — never inline in a feature migration.
- Each activation includes a comment explaining which feature uses it.
- Supabase: enable via Dashboard → Database → Extensions **and** include in migration for reproducibility.
- Always use `CREATE EXTENSION IF NOT EXISTS` — never assume presence.

### 13.3 Column Types per Extension

| Use case                  | Type / Index                                      | Extension      |
|---------------------------|---------------------------------------------------|----------------|
| LLM embeddings            | `vector(1536)`, HNSW index                        | pgvector       |
| GPS coordinates           | `geography(POINT, 4326)`, GIST index              | PostGIS        |
| Geometric shapes          | `geometry(POLYGON, 4326)`                         | PostGIS        |
| Fuzzy text search         | `gin_trgm_ops` index                              | pg_trgm        |
| Full-text search          | `tsvector`, GIN index                             | built-in       |
| Encrypted fields          | `bytea` + `pgp_sym_encrypt()`                     | pgcrypto       |
| JSON Schema validation    | `jsonb` + CHECK constraint                        | pg_jsonschema  |
| Multi-dim distance        | `cube` type                                       | cube           |

```sql
-- Example: products table using multiple extensions
CREATE TABLE products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    description   TEXT,
    location      geography(POINT, 4326),   -- PostGIS
    search_vector tsvector,                 -- full-text
    embedding     vector(1536),             -- pgvector (LLM)
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_products_location  ON products USING GIST (location);
CREATE INDEX idx_products_search    ON products USING GIN  (search_vector);
CREATE INDEX idx_products_embedding ON products USING hnsw (embedding vector_cosine_ops);
```

---

## 14. Row Level Security (RLS)

**All tables have RLS enabled — no exceptions.**
Auth domain tables are fully private. All other tables define explicit, documented policies.

### 14.1 Global RLS Activation

```sql
-- Enable + force RLS on every table at creation time.
-- FORCE ensures even the table owner is subject to policies.
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         FORCE ROW LEVEL SECURITY;

ALTER TABLE orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders        FORCE ROW LEVEL SECURITY;

-- ... repeat for all tables in every migration that creates a table.
```

### 14.2 Auth Tables — Fully Private

All auth tables are **inaccessible to all roles** except the backend `service_role`.
No policy is defined — in PostgreSQL, RLS enabled with no policy = zero access (default deny).

```sql
ALTER TABLE auth_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens   FORCE ROW LEVEL SECURITY;
-- No policy defined → default deny for anon + authenticated

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE api_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys      FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE auth_tokens   IS 'Private. service_role only. No RLS policy defined — default deny.';
COMMENT ON TABLE user_sessions IS 'Private. service_role only. No RLS policy defined — default deny.';
COMMENT ON TABLE api_keys      IS 'Private. service_role only. No RLS policy defined — default deny.';
```

### 14.3 Policy Naming Convention

```
rls_{table}_{role}_{action}
```

| Example                           | Meaning                                   |
|-----------------------------------|-------------------------------------------|
| `rls_products_anon_select`        | Anonymous users can SELECT products       |
| `rls_orders_owner_insert`         | Authenticated owner can INSERT own orders |
| `rls_documents_org_select`        | Org-scoped SELECT on documents            |
| `rls_orders_admin_all`            | Admin role has full access to orders      |

### 14.4 Standard Policy Templates

#### Public read — catalog / content tables
```sql
CREATE POLICY rls_products_anon_select ON products
    FOR SELECT TO anon, authenticated
    USING (deleted_at IS NULL);
```

#### Authenticated — own data only
```sql
CREATE POLICY rls_profiles_owner_select ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY rls_profiles_owner_update ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
```

#### Owner — resource owned by user
```sql
CREATE POLICY rls_orders_owner_select ON orders
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY rls_orders_owner_insert ON orders
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
```

#### Role-based — admin access
```sql
CREATE POLICY rls_orders_admin_all ON orders
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            INNER JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = auth.uid() AND r.slug = 'admin'
        )
    );
```

#### Multi-tenant — organization scoped
```sql
CREATE POLICY rls_documents_org_select ON documents
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
        )
        AND deleted_at IS NULL
    );
```

### 14.5 RLS Policy Matrix

Maintain `database/rls/MATRIX.md` and keep it up to date with every migration:

```
Table            | anon     | authenticated (own) | admin   | service_role
-----------------|----------|---------------------|---------|-------------
users            | —        | SELECT, UPDATE(own) | ALL     | ALL (bypass)
profiles         | SELECT   | SELECT, UPDATE(own) | ALL     | ALL (bypass)
orders           | —        | ALL (own)           | ALL     | ALL (bypass)
products         | SELECT   | —                   | ALL     | ALL (bypass)
documents        | —        | ALL (org-scoped)    | ALL     | ALL (bypass)
auth_tokens      | —        | —                   | —       | ALL (bypass)
user_sessions    | —        | —                   | —       | ALL (bypass)
api_keys         | —        | —                   | —       | ALL (bypass)
```

### 14.6 RLS Rules

- **Default deny**: RLS enabled + no policy = zero access. This is intentional for auth tables.
- All SELECT policies must include `AND deleted_at IS NULL` (soft delete guard).
- Never use `SECURITY DEFINER` to blanket-bypass RLS — only in audited RPC functions (see §15).
- Test policies in dev with: `SET LOCAL role = authenticated; SET LOCAL request.jwt.claim.sub = '<uuid>';`
- Re-evaluate all RLS policies on every schema change — add to migration review checklist.
- Never expose `service_role` key to frontend clients under any circumstance.

---

## 15. RPC Functions (Stored Procedures)

Use PostgreSQL RPC functions when:
- The algorithm requires **multiple atomic writes** that must commit or rollback together.
- The logic is too complex or slow outside the DB: recursive CTEs, graph traversal, geospatial computation, vector ranking.
- The operation must **bypass RLS in a controlled, audited way** (`SECURITY DEFINER`).
- Called from backend via `supabase.rpc('rpc_name', params)` or raw `SELECT rpc_name(params)`.

### 15.1 Naming Convention

```
rpc_{domain}_{action}
```

Examples: `rpc_orders_place`, `rpc_auth_rotate_token`, `rpc_search_semantic`, `rpc_geo_nearby`, `rpc_analytics_revenue_rollup`.

### 15.2 File Structure & Header

Each RPC lives in: `database/rpc/{domain}/rpc_{domain}_{action}.sql`

```sql
-- # rpc_auth_rotate_token.sql
--
-- Action      : Atomically revoke current refresh token and issue a new one.
-- Security    : SECURITY DEFINER (bypasses RLS — runs as owner)
-- Input       : p_old_token TEXT, p_user_id UUID
-- Output      : TABLE(new_token TEXT, expires_at TIMESTAMPTZ)
-- Side effects: Inserts into auth_tokens, sets revoked_at on old token
-- Called from : RefreshTokenUseCase (backend service_role only — never from client)
-- Version     : 1
```

### 15.3 RPC Examples

#### Auth — Atomic Token Rotation
```sql
CREATE OR REPLACE FUNCTION rpc_auth_rotate_token(
    p_old_token TEXT,
    p_user_id   UUID
)
RETURNS TABLE(new_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_new_token  TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM auth_tokens
        WHERE token_hash = digest(p_old_token, 'sha256')
          AND user_id    = p_user_id
          AND revoked_at IS NULL
          AND expires_at  > NOW()
    ) THEN
        RAISE EXCEPTION 'INVALID_REFRESH_TOKEN';
    END IF;

    UPDATE auth_tokens SET revoked_at = NOW()
    WHERE token_hash = digest(p_old_token, 'sha256') AND user_id = p_user_id;

    v_new_token  := encode(gen_random_bytes(64), 'hex');
    v_expires_at := NOW() + INTERVAL '7 days';

    INSERT INTO auth_tokens(user_id, token_hash, expires_at)
    VALUES (p_user_id, digest(v_new_token, 'sha256'), v_expires_at);

    RETURN QUERY SELECT v_new_token, v_expires_at;
END; $$;
```

#### Search — Semantic Vector Search (pgvector)
```sql
-- Security: SECURITY INVOKER — respects caller RLS
CREATE OR REPLACE FUNCTION rpc_search_semantic(
    p_embedding vector(1536),
    p_limit     INT   DEFAULT 10,
    p_threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE(id UUID, title TEXT, similarity FLOAT)
LANGUAGE sql SECURITY INVOKER STABLE AS $$
    SELECT
        d.id,
        d.title,
        1 - (d.embedding <=> p_embedding) AS similarity
    FROM documents d
    WHERE d.deleted_at IS NULL
      AND 1 - (d.embedding <=> p_embedding) >= p_threshold
    ORDER BY d.embedding <=> p_embedding
    LIMIT p_limit;
$$;
```

#### Geo — Nearby Locations (PostGIS)
```sql
CREATE OR REPLACE FUNCTION rpc_geo_nearby(
    p_lat      FLOAT,
    p_lng      FLOAT,
    p_radius_m INT DEFAULT 5000,
    p_limit    INT DEFAULT 20
)
RETURNS TABLE(id UUID, name TEXT, distance_m FLOAT)
LANGUAGE sql SECURITY INVOKER STABLE AS $$
    SELECT
        l.id,
        l.name,
        ST_Distance(
            l.location::geography,
            ST_MakePoint(p_lng, p_lat)::geography
        ) AS distance_m
    FROM locations l
    WHERE l.deleted_at IS NULL
      AND ST_DWithin(
            l.location::geography,
            ST_MakePoint(p_lng, p_lat)::geography,
            p_radius_m
          )
    ORDER BY distance_m
    LIMIT p_limit;
$$;
```

#### Orders — Atomic Place Order (multi-table write)
```sql
CREATE OR REPLACE FUNCTION rpc_orders_place(
    p_user_id UUID,
    p_items   JSONB   -- [{product_id, quantity, unit_price}]
)
RETURNS TABLE(order_id UUID, total_amount NUMERIC, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order_id   UUID := gen_random_uuid();
    v_total      NUMERIC := 0;
    v_item       JSONB;
    v_product_id UUID;
    v_qty        INT;
    v_price      NUMERIC;
    v_stock      INT;
    v_ts         TIMESTAMPTZ := NOW();
BEGIN
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'ORDER_EMPTY';
    END IF;

    INSERT INTO orders(id, user_id, total_amount, created_at)
    VALUES (v_order_id, p_user_id, 0, v_ts);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty        := (v_item->>'quantity')::INT;
        v_price      := (v_item->>'unit_price')::NUMERIC;

        SELECT stock_count INTO v_stock FROM products WHERE id = v_product_id FOR UPDATE;

        IF v_stock < v_qty THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_product_id;
        END IF;

        UPDATE products SET stock_count = stock_count - v_qty WHERE id = v_product_id;

        INSERT INTO order_items(order_id, product_id, quantity, unit_price)
        VALUES (v_order_id, v_product_id, v_qty, v_price);

        v_total := v_total + (v_qty * v_price);
    END LOOP;

    UPDATE orders SET total_amount = v_total WHERE id = v_order_id;

    INSERT INTO events(user_id, event_type, payload, created_at)
    VALUES (p_user_id, 'order.placed',
            jsonb_build_object('order_id', v_order_id, 'total', v_total), v_ts);

    RETURN QUERY SELECT v_order_id, v_total, v_ts;
END; $$;
```

#### Analytics — Revenue Rollup with Window Functions
```sql
CREATE OR REPLACE FUNCTION rpc_analytics_revenue_rollup(
    p_user_id UUID,
    p_period  TEXT DEFAULT 'month',   -- 'day' | 'week' | 'month'
    p_from    DATE DEFAULT (NOW() - INTERVAL '12 months')::DATE,
    p_to      DATE DEFAULT NOW()::DATE
)
RETURNS TABLE(period TEXT, revenue NUMERIC, running_total NUMERIC, growth_pct FLOAT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Admin guard
    IF NOT EXISTS (
        SELECT 1 FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user_id AND r.slug = 'admin'
    ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

    RETURN QUERY
    WITH rev AS (
        SELECT
            TO_CHAR(DATE_TRUNC(p_period, o.created_at), 'YYYY-MM-DD') AS period,
            SUM(o.total_amount) AS revenue
        FROM orders o
        WHERE o.created_at::DATE BETWEEN p_from AND p_to
          AND o.deleted_at IS NULL
        GROUP BY DATE_TRUNC(p_period, o.created_at)
    )
    SELECT
        r.period,
        r.revenue,
        SUM(r.revenue) OVER (ORDER BY r.period) AS running_total,
        ROUND(
            ((r.revenue - LAG(r.revenue) OVER (ORDER BY r.period))
            / NULLIF(LAG(r.revenue) OVER (ORDER BY r.period), 0) * 100)::NUMERIC, 2
        )::FLOAT AS growth_pct
    FROM rev r ORDER BY r.period;
END; $$;
```

### 15.4 RPC Rules

- `SECURITY DEFINER` only when RLS bypass is required. Always add `SET search_path = public` to prevent search path injection.
- `SECURITY INVOKER` for read-only or user-scoped functions — RLS is respected.
- RPC functions are called from **backend UseCase layer only** — never directly from the frontend.
- Always raise typed exceptions: `RAISE EXCEPTION 'ERROR_CODE'` — never return null silently on error.
- Grant execute permissions explicitly, never to `anon`:

```sql
GRANT EXECUTE ON FUNCTION rpc_orders_place(UUID, JSONB)      TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_auth_rotate_token(TEXT, UUID)  TO service_role;
GRANT EXECUTE ON FUNCTION rpc_search_semantic(vector, INT, FLOAT) TO authenticated;
REVOKE EXECUTE ON FUNCTION rpc_orders_place(UUID, JSONB)     FROM PUBLIC;
```

- When a function signature changes, create a new versioned function (`rpc_search_semantic_v2`) and deprecate the old one with a `COMMENT`.
- All RPC files live in `database/rpc/{domain}/` and are applied via migrations.

---

*Last updated: 2026 — maintain this file alongside any schema change or new domain module.*