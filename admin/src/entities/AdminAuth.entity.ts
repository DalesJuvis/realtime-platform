/**
 * # AdminAuthEntity
 *
 * This backend has no login endpoint and no admin accounts/roles — the
 * Admin API is guarded by a single static bearer token
 * (`AdminTokenGuard::require_admin_token`, `ADMIN_API_TOKEN`), the same
 * token for every caller, valid against exactly one engine instance (its
 * `admin_bind_addr`, e.g. `http://localhost:9090` for `engine-a`). There is
 * no way to validate a token except by trying a real admin call — see
 * `adminAuth.store.ts`'s doc comment.
 */

export interface AdminConnection {
  readonly apiUrl: string
  readonly token: string
}
