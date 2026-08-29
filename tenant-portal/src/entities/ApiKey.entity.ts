/**
 * # ApiKeyEntity
 *
 * Mirrors `ApiKeyDto`/`GeneratedApiKeyDto` from `modules::portal` — a
 * named, independently-revocable key pair, additive to (never a
 * replacement for) the tenant's own primary secret at Settings → API
 * keys. `ApiKey` (list/read) never carries a secret; `GeneratedApiKey`
 * (the response to generating one) is the only shape that ever does,
 * shown exactly once.
 */

export type ApiKeyStatus = 'active' | 'revoked'

export interface ApiKey {
  readonly id: string
  readonly name: string
  readonly publicKey: string
  readonly status: ApiKeyStatus
  readonly createdAt: string
  readonly revokedAt: string | null
}

export interface GeneratedApiKey {
  readonly id: string
  readonly name: string
  readonly publicKey: string
  readonly secret: string
  readonly createdAt: string
}
