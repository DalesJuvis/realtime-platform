/**
 * # DataTable
 *
 * Universal, fully typed table component (FRONTEND.md §19) — the single
 * list-rendering component for every resource in the admin panel. Features:
 * search, icon-button sort, pagination, shimmer skeleton loading, empty/error
 * states, a leading checkbox column with a bulk-actions bar (always offering
 * a CSV export of the selection, plus any caller-supplied `bulkActions`), and
 * a trailing ellipsis dropdown for per-row actions.
 *
 * Input:  DataTableProps<TRow> — `source` must be memoized by the caller
 *         (`useMemo`/`useCallback`) so the load effect doesn't loop.
 * Output: Rendered table with loading, error, and empty states.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { cn, downloadBlob, toCsv } from '@lib/utils'
import { errorMessage } from '@lib/errors'
import { SkeletonTable } from '@components/ui/Skeleton'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@components/ui/table'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { ChevronLeft, ChevronRight, Search, ArrowUp, ArrowDown, ArrowUpDown, MoreHorizontal, Download } from 'lucide-react'
import type { BulkAction, ColumnDef, DataSource, DataTableProps, SortDirection } from '@entities/DataTable.entity'

const DEFAULT_PAGE_SIZE = 30

async function loadDataSource<TRow>(source: DataSource<TRow>): Promise<TRow[]> {
  return source.type === 'json' ? source.data : source.fn()
}

export function DataTable<TRow extends object>({
  source,
  columns,
  renderEmpty,
  searchable = true,
  pagination = true,
  pageSize: pageSizeProp,
  skeletonRows = 8,
  onRowClick,
  className,
  rowClassName,
  refreshKey,
  selectable = false,
  getRowId,
  bulkActions,
  exportFilename = 'export',
  rowActions,
  filters,
}: DataTableProps<TRow>) {
  const pageSize = pageSizeProp ?? DEFAULT_PAGE_SIZE

  const [data, setData] = useState<TRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [toolbarStuck, setToolbarStuck] = useState(false)
  const toolbarSentinelRef = useRef<HTMLDivElement>(null)

  // Detects when the sticky toolbar has actually "stuck" to the top of its
  // scroll container (as opposed to just sitting at its natural position) —
  // an IntersectionObserver on a 1px sentinel just above it is the standard,
  // scroll-container-agnostic way to do this (no raw scroll-position math).
  useEffect(() => {
    const sentinel = toolbarSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => setToolbarStuck(!(entry?.isIntersecting ?? true)), {
      threshold: 0,
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelectedIds(new Set())
    loadDataSource(source)
      .then((rows) => {
        if (!cancelled) setData(rows)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e, 'Failed to load data.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, refreshKey])

  const filtered = useMemo(() => {
    let rows = data
    for (const f of filters ?? []) {
      const value = filterValues[f.key]
      if (value && value !== 'all') {
        rows = rows.filter((row) => String(row[f.key] ?? '') === value)
      }
    }
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)))
    }
    return rows
  }, [data, search, filters, filterValues])

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a, b) => {
      const av = String((a as Record<string, unknown>)[sortKey] ?? '')
      const bv = String((b as Record<string, unknown>)[sortKey] ?? '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated = pagination ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir('asc')
        return key
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'))
      return key
    })
  }, [])

  const pageRowIds = useMemo(() => (getRowId ? paginated.map(getRowId) : []), [paginated, getRowId])
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id))
  const somePageSelected = !allPageSelected && pageRowIds.some((id) => selectedIds.has(id))

  const selectedRows = useMemo(
    () => (getRowId ? data.filter((row) => selectedIds.has(getRowId(row))) : []),
    [data, selectedIds, getRowId],
  )

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageRowIds.forEach((id) => next.delete(id))
      } else {
        pageRowIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function runBulkAction(action: BulkAction<TRow>) {
    const applicable = action.isAvailable ? selectedRows.filter(action.isAvailable) : selectedRows
    if (applicable.length === 0) return
    await action.onClick(applicable)
    setSelectedIds(new Set())
  }

  function exportRows(rows: TRow[]) {
    const csv = toCsv(rows, columns)
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${exportFilename}.csv`)
  }

  const extraCols = (selectable ? 1 : 0) + (rowActions ? 1 : 0)

  const hasToolbar = searchable || (filters && filters.length > 0) || selectable

  return (
    <div className={cn('w-full space-y-3', className)}>
      {hasToolbar && (
        <>
          <div ref={toolbarSentinelRef} aria-hidden="true" className="h-px" />
          <div
            className={cn(
              'sticky top-0 z-10 space-y-3 border-b pb-3 pt-1 transition-[background-color,backdrop-filter,border-color] duration-200',
              toolbarStuck ? 'border-border bg-background/70 backdrop-blur-md' : 'border-transparent bg-background',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {searchable && (
                  <div className="relative max-w-xs flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search…"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                      }}
                      className="pl-8"
                    />
                  </div>
                )}
                {filters?.map((f) => (
                  <Select
                    key={f.key}
                    value={filterValues[f.key] ?? 'all'}
                    onValueChange={(value) => {
                      setFilterValues((prev) => ({ ...prev, [f.key]: value }))
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className="w-auto min-w-36 gap-2">
                      <SelectValue placeholder={f.label} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {f.label.toLowerCase()}</SelectItem>
                      {f.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
              {selectable && sorted.length > 0 && selectedRows.length === 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => exportRows(sorted)}>
                  <Download className="h-4 w-4" />
                  Export all
                </Button>
              )}
            </div>

            {selectable && selectedRows.length > 0 && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-2">
                <span className="text-sm font-medium">{selectedRows.length} selected</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => exportRows(selectedRows)}>
                    <Download className="h-4 w-4" />
                    Export selected
                  </Button>
                  {bulkActions?.map((action) => {
                    const applicableCount = action.isAvailable
                      ? selectedRows.filter(action.isAvailable).length
                      : selectedRows.length
                    const Icon = action.icon
                    return (
                      <Button
                        key={action.label}
                        type="button"
                        variant={action.variant ?? 'outline'}
                        size="sm"
                        disabled={applicableCount === 0}
                        onClick={() => void runBulkAction(action)}
                      >
                        {Icon && <Icon className="h-4 w-4" />}
                        {action.label}
                      </Button>
                    )
                  })}
                </div>
                <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleSelectAllOnPage}
                    aria-label="Select all rows on this page"
                  />
                </TableHead>
              )}
              {columns.map((col) => {
                const active = col.sortable && sortKey === col.key
                const SortIcon = active ? (sortDir === 'asc' ? ArrowUp : sortDir === 'desc' ? ArrowDown : ArrowUpDown) : ArrowUpDown
                return (
                  <TableHead
                    key={col.key}
                    style={{ width: col.width }}
                    className={cn(col.align === 'center' && 'text-center', col.align === 'right' && 'text-right')}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 select-none hover:text-foreground',
                          active && 'text-foreground',
                        )}
                      >
                        {col.header}
                        <SortIcon className={cn('h-3.5 w-3.5', !active && 'opacity-40')} />
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                )
              })}
              {rowActions && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonTable rows={skeletonRows} cols={columns.length + extraCols} />
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + extraCols} className="py-12 text-center text-muted-foreground">
                  {renderEmpty ? renderEmpty() : 'No results found.'}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((row, i) => {
                const rowId = getRowId?.(row)
                const items = rowActions?.(row).filter((a) => !a.hidden) ?? []
                return (
                  <TableRow
                    key={rowId ?? i}
                    onClick={() => onRowClick?.(row)}
                    data-state={rowId && selectedIds.has(rowId) ? 'selected' : undefined}
                    className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                  >
                    {selectable && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={rowId ? selectedIds.has(rowId) : false}
                          onCheckedChange={() => rowId && toggleSelectRow(rowId)}
                          aria-label="Select row"
                        />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          col.align === 'center' && 'text-center',
                          col.align === 'right' && 'text-right tabular-nums',
                        )}
                      >
                        {col.renderCell ? col.renderCell(row[col.key], row) : String(row[col.key] ?? '—')}
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {items.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Row actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {items.map((action) => {
                                const Icon = action.icon
                                return (
                                  <DropdownMenuItem
                                    key={action.label}
                                    disabled={action.disabled ?? false}
                                    className={cn(action.variant === 'destructive' && 'text-destructive focus:text-destructive')}
                                    onClick={() => void action.onClick(row)}
                                  >
                                    {Icon && <Icon className="h-4 w-4" />}
                                    {action.label}
                                  </DropdownMenuItem>
                                )
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && !isLoading && sorted.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{sorted.length} results</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 tabular-nums">
              {page} / {totalPages}
            </span>
            <Button variant="ghost" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export type { ColumnDef }
