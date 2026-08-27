/**
 * # DataTable types
 *
 * Type system for the DataTable component (FRONTEND.md §19), trimmed to the
 * two data sources this app actually uses (`json`, `request`) — CSV/XML/URL
 * ingestion from the generic template are dropped as dead code for this app.
 */

export type SortDirection = 'asc' | 'desc' | null

export interface ColumnDef<TRow> {
  readonly key: keyof TRow & string
  readonly header: string
  readonly sortable?: boolean
  readonly width?: string
  readonly align?: 'left' | 'center' | 'right'
  readonly renderCell?: (value: TRow[keyof TRow], row: TRow) => React.ReactNode
  /** Plain-text value for CSV export when the raw field isn't already a string (e.g. an object). */
  readonly csvValue?: (row: TRow) => string
}

export type DataSource<TRow> = { type: 'json'; data: TRow[] } | { type: 'request'; fn: () => Promise<TRow[]> }

/** A single-select dropdown filter offered in the toolbar, matching rows by exact column value. */
export interface FilterDef<TRow> {
  readonly key: keyof TRow & string
  readonly label: string
  readonly options: { readonly value: string; readonly label: string }[]
}

/** A group action offered in the bulk-actions bar once one or more rows are selected. */
export interface BulkAction<TRow> {
  readonly label: string
  readonly icon?: React.ComponentType<{ className?: string }>
  readonly variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
  /** Filters which of the selected rows this action applies to; disabled if none qualify. */
  readonly isAvailable?: (row: TRow) => boolean
  readonly onClick: (rows: TRow[]) => void | Promise<void>
}

/** One entry in a row's ellipsis dropdown — DataTable renders the trigger + menu itself. */
export interface RowActionItem<TRow> {
  readonly label: string
  readonly icon?: React.ComponentType<{ className?: string }>
  readonly variant?: 'default' | 'destructive'
  readonly disabled?: boolean
  /** Omit this item entirely for a given row (e.g. "Cancel" once already cancelled). */
  readonly hidden?: boolean
  readonly onClick: (row: TRow) => void | Promise<void>
}

export interface DataTableProps<TRow extends object> {
  source: DataSource<TRow>
  columns: ColumnDef<TRow>[]
  renderEmpty?: () => React.ReactNode
  searchable?: boolean
  pagination?: boolean
  pageSize?: number
  skeletonRows?: number
  onRowClick?: (row: TRow) => void
  className?: string
  rowClassName?: (row: TRow) => string
  /** Re-run the source loader — bump to force a refetch after a mutation. */
  refreshKey?: string | number
  /** Enables the leading checkbox column + bulk-actions bar (always includes "Export selected"). Requires `getRowId`. */
  selectable?: boolean
  /** Stable string identity for a row — required when `selectable` or `rowActions` is used. */
  getRowId?: (row: TRow) => string
  /** Extra group actions available once rows are selected, alongside the built-in CSV export (see `selectable`). */
  bulkActions?: BulkAction<TRow>[]
  /** Base filename (no extension) for the built-in "Export selected"/"Export all" CSV downloads. */
  exportFilename?: string
  /** Items for the trailing ellipsis dropdown menu, per row. */
  rowActions?: (row: TRow) => RowActionItem<TRow>[]
  /** Dropdown filters shown next to the search input, in the sticky toolbar. */
  filters?: FilterDef<TRow>[]
}
