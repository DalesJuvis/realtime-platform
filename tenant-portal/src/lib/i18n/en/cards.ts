/** Shared cards reused across pages — `MintTokenCard`/`VapidKeyCard`
 * (Overview + Settings) and `SetupGuideCard` (Overview only, but kept
 * here alongside its Overview siblings rather than a lone page-scoped
 * key). */
export const cards = {
  // MintTokenCard
  clientTokenTitle: 'Client token',
  clientTokenDescription: 'Mint a signed WebSocket/TCP token for a user of your app — your secret key never leaves the server.',
  subjectLabel: 'Subject (sub)',
  expiresInLabel: 'Expires in',
  ttl1Hour: '1 hour (default)',
  ttl24Hours: '24 hours',
  ttl7Days: '7 days',
  ttl30Days: '30 days (maximum)',
  minting: 'Minting…',
  mintToken: 'Mint token',
  mintTokenHint:
    "A long-lived token stays valid until it expires, with no way to revoke it early — pick the shortest duration that fits how you'll use it. For a hand-pasted embed on a static site with no backend of its own, that's usually a longer preset than the 1-hour default: there's no automated renewal, so when it expires you'll need to mint a new one and re-paste it.",
  token: 'Token',
  expiresInDuration: (duration: string) => `Expires in ${duration}.`,
  downloadCredentials: 'Download mio-credentials.json',
  mintTokenFailed: 'Failed to mint token.',

  // VapidKeyCard
  vapidKeyTitle: 'VAPID public key',
  vapidKeyDescriptionPrefix:
    'For real Web Push (notifications with the tab or browser fully closed) from your own site or app — pass this as',
  vapidKeyDescriptionMiddle: 'to',
  vapidKeyDescriptionSuffix: 'Shared by every tenant on this instance — not a secret, safe to embed client-side.',
  vapidPublicKeyLabel: 'VAPID public key',
  loading: 'Loading…',

  // SetupGuideCard
  setupGuideTitle: 'Setup guide',
  dismissSetupGuide: 'Dismiss setup guide',
  ofComplete: (done: number, total: number) => `${done} of ${total} complete`,
  stepGenerateApiKeys: 'Generate your API keys',
  stepPublishToChannel: 'Publish to a channel',
  stepSaveTemplate: 'Save a message template',
}
