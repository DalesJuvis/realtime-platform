/** ChannelsPage — the live channel table. Channels aren't a persisted
 * registry server-side, so this is just column/status/action copy for a
 * client-derived list, not full resource vocabulary. */
export const channels = {
  pageTitle: 'Channels',
  pageSubtitle: 'Channels currently in use, with their live subscriber count.',

  channelColumn: 'Channel',
  subscribersColumn: 'Subscribers',
  idleStatus: 'Idle',

  channelIdLabel: 'Channel ID',
  copyChannelId: 'Copy channel ID',

  emptyState: 'No channels yet — one appears here the moment a client subscribes or publishes.',
}
