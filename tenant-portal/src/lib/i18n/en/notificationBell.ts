/** The global notification bell (`NotificationBell`, shown in the
 * sidebar/mobile header on every page) — the persisted feed of messages
 * published to this tenant's channels, distinct from `cards.vapidKey*`
 * (which is about subscribing a browser to Web Push) and
 * `settings.notifications*` (the push-toggle in Settings itself). */
export const notificationBell = {
  bellAriaLabel: 'Notifications',
  unreadAriaLabel: (count: number) => `${count} unread notification${count === 1 ? '' : 's'}`,
  title: 'Notifications',
  markAllRead: 'Mark all read',
  empty: 'No notifications yet',
  emptyDescription: "Messages published to your tenant's channels will show up here.",
  loadFailed: 'Failed to load notifications.',
  markReadFailed: 'Failed to mark notification read.',
  markAllReadFailed: 'Failed to mark all notifications read.',
}
