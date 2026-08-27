/**
 * # ConnectionEntity
 *
 * Credentials and live status for the WebSocket connection to a realtime-engine
 * instance. `token` is issued server-side (`TokenService::issue_token`) — this
 * app never derives it from a tenant secret.
 */

export interface ConnectionCredentials {
  readonly wsUrl: string
  readonly tenantId: string
  readonly token: string
  readonly displayName: string
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'
