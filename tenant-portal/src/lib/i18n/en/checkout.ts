/** Checkout page — mock hosted-session list (no checkout/session-link
 * feature yet). */
export const checkout = {
  pageTitle: 'Checkout',
  pageSubtitle: 'Hosted sessions for this workspace — sample data, not yet a real feature.',
  columns: {
    reference: 'Reference',
    channel: 'Channel',
    created: 'Created',
    expires: 'Expires',
  },
  channelFilterLabel: 'Channel',
  channelOptions: {
    Web: 'Web',
    Mobile: 'Mobile',
    API: 'API',
  },
  statusOptions: {
    active: 'Active',
    completed: 'Completed',
    expired: 'Expired',
  },
  copyLink: 'Copy link',
  copyNotAvailable: 'Session links are not available yet.',
  expireNow: 'Expire now',
  expireNotAvailable: 'Session management is not available yet.',
}
