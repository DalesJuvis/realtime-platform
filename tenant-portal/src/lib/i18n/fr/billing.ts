import type { billing as en } from '../en/billing'

export const billing = {
  pageTitle: 'Facturation',
  pageSubtitle: "Factures de l'abonnement de cet espace de travail — données fictives, pas encore reliées à un système de facturation réel.",
  columns: {
    reference: 'Référence',
    period: 'Période',
    amount: 'Montant',
    issued: 'Émise',
  },
  statusOptions: {
    paid: 'Payée',
    pending: 'En attente',
    failed: 'Échouée',
  },
  downloadPdf: 'Télécharger le PDF',
  pdfNotAvailable: 'Les PDF de facture ne sont pas encore disponibles.',
} satisfies typeof en
