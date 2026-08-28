/**
 * # credentialsFile
 *
 * Builds the downloadable `mio-credentials.json` from a `MintedCredentials`
 * — everything `new RealtimeClient(...)` needs in one file, the same idea
 * as a Firebase service-account JSON you download once and load straight
 * into an SDK. Adapted to what this platform actually has: no API key
 * concept beyond `tenant_id` itself (already labelled "Public key" on
 * `PublicKeyCard`/Settings — `public_key` here is that same value, just
 * named for what a reader expects next to `token`), and no project/app id
 * to include, so nothing is invented to fill the shape out.
 */

import { env } from '@lib/env'
import { deriveWsHost } from '@lib/utils'
import type { MintedCredentials } from '@entities/MintedCredentials.entity'

export function buildCredentialsFile(creds: MintedCredentials) {
  return {
    type: 'mio_client_credentials',
    tenant_id: creds.tenantId,
    public_key: creds.tenantId,
    sub: creds.sub,
    token: creds.token,
    expires_in: creds.expiresIn,
    issued_at: creds.issuedAt,
    connection: {
      host: deriveWsHost(env.defaultApiUrl),
      port: 8080,
      secure: new URL(env.defaultApiUrl).protocol === 'https:',
    },
  }
}

/** A minted token is only ever valid for `expiresIn` seconds — this
 * persists across reloads now (see `store/mintedToken.store`), so unlike
 * before, a long-untouched tab really can come back to a token minted
 * hours ago. Treated as gone rather than shown stale. */
export function isCredentialsExpired(creds: MintedCredentials): boolean {
  return Date.now() > new Date(creds.issuedAt).getTime() + creds.expiresIn * 1000
}
