/**
 * # decodeSessionPayload
 *
 * Decodes (never verifies — verification happens server-side on every
 * request) the payload segment of a portal session token, purely for
 * client-side display (tenant ID, email) right after register/login,
 * since `SessionTokenResponseDto` doesn't repeat those fields separately.
 */
export interface DecodedSessionPayload {
  readonly user_id: string
  readonly tenant_id: string
  readonly email: string
  readonly exp: number
}

export function decodeSessionPayload(token: string): DecodedSessionPayload {
  const segments = token.split('.')
  const payload = segments[0]
  if (!payload) throw new Error('Malformed session token: missing payload segment')

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const json = atob(padded)

  return JSON.parse(json) as DecodedSessionPayload
}
