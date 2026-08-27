/**
 * # ChannelEntity
 *
 * Mirrors `ChannelSummaryDto` from `modules::portal`. Channels are never a
 * first-class persisted entity server-side — one exists the moment
 * something SUBs or PUBs on it, so this list reflects live state, not a
 * registry.
 */
export interface Channel {
  readonly channel_id: string
  readonly subscriber_count: number
}
