import type { checkout as en } from '../en/checkout'

export const checkout = {
  pageTitle: 'Paiement',
  pageSubtitle: "Sessions hébergées de cet espace de travail — données fictives, ce n'est pas encore une fonctionnalité réelle.",
  columns: {
    reference: 'Référence',
    channel: 'Canal',
    created: 'Créée',
    expires: 'Expire',
  },
  channelFilterLabel: 'Canal',
  channelOptions: {
    Web: 'Web',
    Mobile: 'Mobile',
    API: 'API',
  },
  statusOptions: {
    active: 'Active',
    completed: 'Terminée',
    expired: 'Expirée',
  },
  copyLink: 'Copier le lien',
  copyNotAvailable: 'Les liens de session ne sont pas encore disponibles.',
  expireNow: 'Expirer maintenant',
  expireNotAvailable: "La gestion des sessions n'est pas encore disponible.",
} satisfies typeof en
