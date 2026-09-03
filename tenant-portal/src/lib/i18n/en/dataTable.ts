/** Strings baked into the shared `DataTable` component itself (toolbar,
 * pagination, bulk-actions bar) — not a per-page module, since every page
 * using `DataTable` sees these exact same labels. */
export const dataTable = {
  searchPlaceholder: 'Search…',
  noResults: 'No results found.',
  exportAll: 'Export all',
  exportSelected: 'Export selected',
  selected: (count: number) => `${count} selected`,
  clear: 'Clear',
  resultsCount: (count: number) => `${count} results`,
  allOf: (label: string) => `All ${label.toLowerCase()}`,
}
