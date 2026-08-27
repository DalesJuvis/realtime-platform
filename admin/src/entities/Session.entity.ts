/**
 * # SessionEntity
 *
 * Mirrors `SessionSummaryDto` from `modules::admin` — one live WS/TCP
 * connection for a given tenant, straight from `PresenceService`.
 */
export interface Session {
  readonly session_id: string
  readonly sub: string
  readonly channels: string[]
  readonly connected_at: string
}
