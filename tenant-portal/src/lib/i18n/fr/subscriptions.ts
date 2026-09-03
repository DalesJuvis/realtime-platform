import type { subscriptions as en } from '../en/subscriptions'

export const subscriptions = {
  pageTitle: 'Abonnements',
  pageSubtitle: "Historique des forfaits de cet espace de travail — données fictives, pas encore reliées à un système de facturation réel.",
  columns: {
    plan: 'Forfait',
    price: 'Prix',
    started: 'Débuté',
    renews: 'Renouvellement',
  },
  statusOptions: {
    active: 'Actif',
    canceled: 'Résilié',
    past_due: 'Impayé',
  },
  free: 'Gratuit',
  monthlyPrice: (amount: string) => `${amount}/mois`,
  cancelPlan: 'Résilier le forfait',
  cancelNotAvailable: "La résiliation d'un forfait n'est pas encore disponible.",
} satisfies typeof en
