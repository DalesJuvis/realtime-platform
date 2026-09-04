/** AiAssistantBlob — the floating recommendation widget mounted once in
 * `AppLayout`. Rule-based (see `computeRecommendation` in the component):
 * no LLM call involved, every string here is a template filled from data
 * already available in the portal (token expiry, device/channel counts,
 * message volume). */
export const assistant = {
  greeting: (name: string) => `Hi, ${name}!`,
  subtitle: 'I have a recommendation for you.',
  close: 'Close',
  keepAside: 'Keep aside',
  taskInputPlaceholder: 'Describe your task…',
  taskNotWiredUp: "That's not wired up yet — for now I can only point out things about your workspace.",

  categoryApiToken: 'API Token',
  categoryWebPush: 'Web Push',
  categoryPushNotifications: 'Push Notifications',
  categoryChannels: 'Channels',
  categoryTemplates: 'Templates',
  categoryBroadcasting: 'Broadcasting',
  categoryPlatform: 'Platform',

  daysUnit: 'days',
  devicesUnit: 'devices',
  channelsUnit: 'channels',
  templatesUnit: 'templates',
  messagesUnit: 'messages',
  requestsUnit: 'requests',

  tokenExpired: "Your minted token has expired — mint a new one so your integrations don't break.",
  tokenExpiringSoon: (days: number) =>
    days <= 1
      ? "Your token expires today — mint a fresh one before it locks your integrations out."
      : `Your token expires in ${days} days — re-mint it before it disrupts anything.`,
  mintNewToken: 'Go to API Keys',

  webPushNotConfigured: "Web Push isn't set up on this backend yet — ask whoever runs it to configure a VAPID keypair.",
  learnAboutWebPush: 'Read the docs',

  noDevicesSubscribed: "Nobody's subscribed to push notifications yet — embed the Push Widget on your site to start collecting subscribers.",
  openPushWidget: 'Open Push Widget',

  noChannelsYet: "You haven't created a channel yet — send your first broadcast to spin one up.",
  goToBroadcasting: 'Go to Broadcasting',

  noTemplatesYet: 'No saved templates yet — save one to speed up your next broadcast.',
  goToTemplates: 'Go to Templates',

  rateLimited: (count: number) => `${count} requests got rate-limited recently — worth checking your publish rate.`,

  allGood: [
    "Everything looks healthy around here. Go build something great.",
    "Nothing on fire, nothing waiting — nice and quiet today.",
    "Your workspace is looking sharp. I'll let you know if that changes.",
  ],
  messagesSentSoFar: (count: number) => (count > 0 ? `${count} messages delivered so far — not bad!` : "No messages sent yet — I'll be here when you're ready."),
  goToOverview: 'View overview',

  loading: "Give me a second, I'm looking around your workspace…",

  positionLabel: 'Assistant position',
  positionHint: 'Where the floating assistant sits on screen — pick a corner, or hide it.',
  positionBottomRight: 'Bottom right',
  positionBottomLeft: 'Bottom left',
  positionTopRight: 'Top right',
  positionTopLeft: 'Top left',
  positionHidden: 'Hidden',
}
