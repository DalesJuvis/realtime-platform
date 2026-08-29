/**
 * # credentialsFile
 *
 * Builds the downloadable `mio-credentials.json` from a `MintedCredentials`
 * — everything `new RealtimeClient(...)` needs in one file, the same idea
 * as a Firebase service-account JSON you download once and load straight
 * into an SDK. Adapted to what this platform actually has: no API key
 * concept beyond `tenant_id` itself (already labelled "Public key" on
 * `PublicKeyCard`/Settings), and no project/app id to include, so nothing
 * is invented to fill the shape out.
 *
 * Deliberately no `public_key` field: an earlier version repeated
 * `tenant_id`'s own value under that second, key-shaped name as a
 * "friendlier alias next to `token`" — in practice that reads as a real
 * bug (two credential-looking fields holding an identical value, with no
 * actual secret anywhere in sight), not a convenience. `tenant_id` is the
 * platform's only public identifier; nothing else to alias it as.
 */

import { env } from '@lib/env'
import { deriveWsHost } from '@lib/utils'
import type { MintedCredentials } from '@entities/MintedCredentials.entity'

export function buildCredentialsFile(creds: MintedCredentials) {
  return {
    type: 'mio_client_credentials',
    tenant_id: creds.tenantId,
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
