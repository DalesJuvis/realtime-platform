/**
 * # chatEnvelope
 *
 * Action:  Encodes/decodes the small JSON envelope this app layers over
 *          the raw `payload` string (see `Chat.entity.ts`).
 * Input:   ChatEnvelope | raw payload string
 * Output:  JSON string (encode) | ChatEnvelope | null (decode)
 */

import type { ChatEnvelope } from '@entities/Chat.entity'
import { MAX_PAYLOAD_BYTES, utf8ByteLength } from '@lib/protocolLimits'

export function encodeChatEnvelope(envelope: ChatEnvelope): string {
  let text = envelope.text
  let json = JSON.stringify({ from: envelope.from, text })

  // Truncate the text (not the `from` field) until the envelope fits the
  // 211-byte payload budget — UTF-8 multi-byte characters mean character
  // count alone isn't a safe bound.
  while (utf8ByteLength(json) > MAX_PAYLOAD_BYTES && text.length > 0) {
    text = text.slice(0, -1)
    json = JSON.stringify({ from: envelope.from, text })
  }

  return json
}

export function decodeChatEnvelope(payload: string): ChatEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(payload)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'from' in parsed &&
      'text' in parsed &&
      typeof (parsed as Record<string, unknown>)['from'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['text'] === 'string'
    ) {
      return parsed as ChatEnvelope
    }
    return null
  } catch {
    return null
  }
}
