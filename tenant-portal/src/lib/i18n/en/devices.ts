/** DevicesPage — the tenant-wide Web Push device management table
 * (`GET`/`DELETE /api/v1/portal/push-subscriptions`,
 * `POST /api/v1/portal/push-subscriptions/test`). Settings → Preferences
 * has its own toggle for subscribing *this* browser — not covered here. */
export const devices = {
  pageTitle: 'Devices',
  pageSubtitle: "Every device currently subscribed to Web Push across your tenant's channels.",

  columnDevice: 'Device',
  columnKind: 'Kind',
  columnChannels: 'Channels',
  columnRegistered: 'Registered',

  kindMobile: 'Mobile',
  kindDesktop: 'Desktop',
  kindOther: 'Other',
  unknownDevice: 'Unknown device',

  sendTestAction: 'Send test',
  testSent: 'Test notification sent.',
  testSendFailed: 'Failed to send test notification.',

  revokeAction: 'Revoke',
  revokeDialogTitle: 'Revoke device',
  revokeConfirmMessage: (deviceLabel: string) =>
    `Revoke "${deviceLabel}"? It will stop receiving push notifications for this tenant.`,
  revoked: 'Device revoked.',
  revokeFailed: 'Failed to revoke device.',

  loadFailed: 'Failed to load devices.',
  emptyState: "No devices subscribed yet — enable notifications from Settings → Preferences, or have an end-user's app subscribe via the SDK.",
}
