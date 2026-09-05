import type { notificationBell as en } from '../en/notificationBell'

export const notificationBell = {
  bellAriaLabel: 'Notifications',
  unreadAriaLabel: (count: number) => `${count} notification${count === 1 ? '' : 's'} non lue${count === 1 ? '' : 's'}`,
  title: 'Notifications',
  markAllRead: 'Tout marquer comme lu',
  empty: 'Aucune notification pour le moment',
  emptyDescription: 'Les messages publiés sur les canaux de votre tenant apparaîtront ici.',
  loadFailed: 'Échec du chargement des notifications.',
  markReadFailed: 'Échec du marquage de la notification comme lue.',
  markAllReadFailed: 'Échec du marquage de toutes les notifications comme lues.',
  deliveryRealtime: 'Livré en direct via WebSocket',
  deliveryPush: 'Livré via le repli push',
} satisfies typeof en
