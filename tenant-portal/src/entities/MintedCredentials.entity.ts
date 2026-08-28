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
}
