/**
 * # KeyPairEntity
 *
 * Mirrors `KeyPairDto` from `modules::portal` — this system's honest
 * equivalent of a Stripe-style publishable/secret key pair. `tenantId` is
 * already the public, safe-to-embed identifier every SDK config carries;
 * `secretKey` is the HMAC secret, used server-side only, to mint client
 * tokens via `POST /api/v1/auth/tokens`.
 */
export interface KeyPair {
  readonly tenantId: string
  readonly secretKey: string
}
