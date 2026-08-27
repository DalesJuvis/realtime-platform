/**
 * # PortalAuthEntity
 *
 * Mirrors `SessionTokenResponseDto` / `PortalSession` from the Rust
 * backend's `modules::portal`. Distinct from a client (WS/TCP) token —
 * this authenticates the portal itself, not a chat connection.
 */
export interface PortalConnection {
  readonly apiUrl: string
  readonly accessToken: string
  readonly tenantId: string
  readonly email: string
  readonly expiresAt: string
}
