/**
 * # protocolLimits
 *
 * Byte limits of the 256-byte binary frame (see root README.md § Protocole).
 * Not exported by `sdk-typescript/src/protocol.ts`, so mirrored here for
 * client-side validation before a frame is even encoded.
 */

export const MAX_CHANNEL_ID_BYTES = 24
export const MAX_PAYLOAD_BYTES = 211

const encoder = new TextEncoder()

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length
}
