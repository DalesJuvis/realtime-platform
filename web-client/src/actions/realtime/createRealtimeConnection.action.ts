/**
 * # createRealtimeConnectionAction
 *
 * Action:  Builds a `RealtimeClient` for the given credentials.
 * Input:   ConnectionCredentials
 * Output:  RealtimeClient (not yet connected — caller calls `.connect()`)
 */

import { RealtimeClient } from '@yourorg/realtime-sdk'
import type { ConnectionCredentials } from '@entities/Connection.entity'

/**
 * Instantiates `RealtimeClient` directly rather than going through
 * `createRealtimeClient()` (which returns the transport-agnostic
 * `RealtimeAdapter` interface): this app needs `.on('open'|'close'|'error'|...)`
 * for connection-status UI, which only the concrete engine client exposes —
 * not part of the `RealtimeAdapter` contract shared with the Firebase/PubNub
 * adapters.
 */
export function createRealtimeConnectionAction(creds: ConnectionCredentials): RealtimeClient {
  return new RealtimeClient({
    url: creds.wsUrl,
    tenantId: creds.tenantId,
    token: creds.token,
  })
}
