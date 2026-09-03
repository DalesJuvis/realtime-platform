import type { reports as en } from '../en/reports'

export const reports = {
  pageTitle: 'Rapports',
  pageSubtitle: "Rapports d'activité et d'utilisation exportables — données fictives, pas encore reliées à un générateur de rapports réel.",
  columns: {
    name: 'Rapport',
    type: 'Type',
    period: 'Période',
    generated: 'Généré',
  },
  typeFilterLabel: 'Type',
  typeOptions: {
    usage: 'Utilisation',
    activity: 'Activité',
    billing: 'Facturation',
  },
  statusOptions: {
    ready: 'Prêt',
    processing: 'En cours',
    failed: 'Échoué',
  },
  download: 'Télécharger',
  downloadNotAvailable: 'Les téléchargements de rapports ne sont pas encore disponibles.',
} satisfies typeof en
