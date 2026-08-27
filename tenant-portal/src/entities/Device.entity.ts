/**
 * # DeviceEntity
 *
 * Mirrors `SessionSummaryDto` from `modules::portal` — one live WS/TCP
 * connection for this tenant, straight from `PresenceService`.
 */
export interface Device {
  readonly session_id: string
  readonly sub: string
  readonly channels: string[]
  readonly connected_at: string
}
