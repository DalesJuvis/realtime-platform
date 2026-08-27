/**
 * # mintClientToken
 *
 * Browser (`SubtleCrypto`) implementation of the exact token format
 * `TokenService::issue_token` produces server-side
 * (`backend/src/modules/auth/services/TokenService.rs`):
 *
 *   base64url(payload_json) "." base64url(HMAC-SHA256(payload_json, tenant_secret))
 *
 * Only ever called with a secret that's already in memory (fresh from a
 * create/rotate response) — never a secret read back out of storage, since
 * this app never persists one (see `tenants.store.ts`).
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function mintClientToken(
  tenantId: string,
  secret: string,
  sub: string,
  ttlSeconds = 3600,
): Promise<string> {
  const claims = { tenant_id: tenantId, sub, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(claims))
  const payloadB64 = base64UrlEncode(payloadBytes)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  const sigB64 = base64UrlEncode(new Uint8Array(signature))

  return `${payloadB64}.${sigB64}`
}
