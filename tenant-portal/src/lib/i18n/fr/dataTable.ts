import type { dataTable as en } from '../en/dataTable'

export const dataTable = {
  searchPlaceholder: 'Rechercher…',
  noResults: 'Aucun résultat.',
  exportAll: 'Tout exporter',
  exportSelected: 'Exporter la sélection',
  selected: (count: number) => `${count} sélectionné${count === 1 ? '' : 's'}`,
  clear: 'Effacer',
  resultsCount: (count: number) => `${count} résultat${count === 1 ? '' : 's'}`,
  allOf: (label: string) => `Tous les ${label.toLowerCase()}`,
} as const satisfies typeof en
