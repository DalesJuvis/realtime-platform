/**
 * # getHealthAction
 *
 * Action:   Liveness probe — unauthenticated, plain text, not the
 *           `{success,data}` envelope (see `apiRequest`'s doc comment).
 * Input:    none
 * Output:   true if the instance responded "ok"
 * Endpoint: GET /api/v1/system/health
 */

import { http } from '@lib/http'

export async function getHealthAction(): Promise<boolean> {
  const response = await http.get<string>('/api/v1/system/health', { responseType: 'text' })
  return response.data === 'ok'
}
