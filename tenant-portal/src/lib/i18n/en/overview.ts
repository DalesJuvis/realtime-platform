/** OverviewPage + ActivityChart — the workspace landing page. */
export const overview = {
  pageTitle: 'Overview',
  pageSubtitle: (email: string) => `${email} — workspace.`,
  liveBadge: (seconds: number) => `Live · updates every ${seconds}s`,
  focusOnMetrics: 'Focus on metrics',
  focusOnMetricsHint: 'Focus on metrics — hides the sidebar and everything else',
  exitFocusMode: 'Exit focus mode',

  // Stat tile / chart series labels — shared between the stat tiles and
  // ActivityChart's dataset legend so the wording never drifts apart.
  activeSessionsLabel: 'Active sessions',
  messagesProcessedLabel: 'Messages processed',
  realtimeMessagesLabel: 'Realtime messages',
  realtimeMessagesHint: 'Delivered live over an open WebSocket connection.',
  pushMessagesLabel: 'Push messages',
  pushMessagesHint: 'Delivered via push fallback — no live connection to reach at publish time.',
  rateLimitedLabel: 'Rate limited',

  activityTitle: 'Activity',
  activityDescription: (sampleCount: number) =>
    `Active sessions, realtime vs. push messages, and rate-limited sends — live, last ${sampleCount} samples.`,
  collectingSamples: 'Collecting live samples — the chart fills in as data comes in.',

  channelsLabel: 'Channels',
  templatesLabel: 'Templates',
  viewLink: 'View',
  viewAll: 'View all',

  topChannelsTitle: 'Top channels',
  noChannelsYet: 'No channels yet.',
  subscriberCount: (count: number) => `${count} subscribers`,

  recentTemplatesTitle: 'Recent templates',
  noTemplatesYet: 'No templates yet.',

  publicKeyTitle: 'Public key',
  publicKeyDescription: 'Your tenant ID for this environment — safe to embed in an SDK config, never a secret.',
  goToApiKeys: 'Go to API keys →',

  recommendationsTitle: 'Recommendations',
  noChannelsRecommendation: 'No channels yet — publish or subscribe to create one.',
  sendABroadcast: 'Send a broadcast',
  noTemplatesRecommendation: 'No templates yet — save one to speed up your broadcasts.',
  createATemplate: 'Create a template',
  rateLimitedRecommendation: (count: number) =>
    `${count} message${count === 1 ? '' : 's'} rate-limited so far — check your send rate if this keeps growing.`,
  goToBroadcasting: 'Go to Broadcasting',
}
