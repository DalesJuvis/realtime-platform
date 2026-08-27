export type MockApiKeyMode = 'sandbox' | 'production'
export type MockApiKeyStatus = 'active' | 'revoked'

/** One named key pair — public + secret key created and revoked together, not separate rows. */
export interface MockApiKeyPair {
  readonly id: string
  readonly name: string
  readonly mode: MockApiKeyMode
  readonly public_key: string
  readonly secret_key: string
  readonly status: MockApiKeyStatus
  readonly created_at: string
}
