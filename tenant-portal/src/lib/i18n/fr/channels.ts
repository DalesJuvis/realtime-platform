import type { channels as en } from '../en/channels'

export const channels = {
  pageTitle: 'Canaux',
  pageSubtitle: 'Canaux actuellement utilisés, avec leur nombre d’abonnés en temps réel.',

  channelColumn: 'Canal',
  subscribersColumn: 'Abonnés',
  idleStatus: 'Inactif',

  channelIdLabel: 'ID du canal',
  copyChannelId: "Copier l'ID du canal",

  emptyState: "Aucun canal pour l'instant — un canal apparaît ici dès qu'un client s'y abonne ou y publie.",
} as const satisfies typeof en
