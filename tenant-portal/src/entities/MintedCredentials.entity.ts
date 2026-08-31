/**
 * # MintedCredentials
 *
 * A minted client token plus everything else `new RealtimeClient(...)`
 * needs, bundled together — what `buildCredentialsFile` turns into the
 * downloadable `mio-credentials.json` (see `lib/credentialsFile.ts`).
 * Persisted (`store/mintedToken.store`) so it survives a page reload —
 * previously plain component state, wiped on every refresh.
 */

export interface MintedCredentials {
  readonly token: string
  readonly expiresIn: number
  readonly tenantId: string
  readonly sub: string
  readonly issuedAt: string
  /** The exact `ws://`/`wss://.../ws` URL to connect to, as returned by
   * `POST /api/v1/portal/tokens` alongside the token itself — derived
   * server-side from the minting request's own host, never guessed or
   * assembled client-side (no more hardcoded port). */
  readonly wsUrl: string
}
