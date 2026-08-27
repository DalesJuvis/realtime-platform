/**
 * # ChatEntity
 *
 * The wire protocol (`sdk-typescript/src/types.ts::RealtimeMessage`) carries
 * only `channelId` + raw text `payload` — no sender identity. This app
 * layers a small JSON envelope on top of that payload (`ChatEnvelope`) so
 * messages can show who sent them; a plain-text payload (e.g. from another
 * client, or `replay()` history) still renders as an anonymous message.
 */

export type ChannelId = string

export interface ChatEnvelope {
  readonly from: string
  readonly text: string
}

export interface ChatMessage {
  readonly id: string
  readonly channelId: ChannelId
  readonly from: string | null
  readonly text: string
  readonly direction: 'in' | 'out'
  readonly receivedAt: number
}

export interface Channel {
  readonly id: ChannelId
  readonly unreadCount: number
}
