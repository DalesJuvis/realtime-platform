/**
 * # cn
 *
 * Merges conditional Tailwind class lists, resolving conflicting utility
 * classes (e.g. "p-2 p-4" -> "p-4") via tailwind-merge. Used for every
 * conditional className in the app — never string interpolation.
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Splits a textarea's raw value into a features/bullet-list array (one entry per non-blank line). */
export function parseLineList(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** Formats a smallest-currency-unit integer amount for display, e.g. 10000 XOF -> "10,000 XOF". */
const ZERO_DECIMAL_CURRENCIES = new Set(['XOF', 'XAF', 'GNF', 'MGA'])

export function formatAmount(amount: number, currency: string): string {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) {
    return `${new Intl.NumberFormat('en-US').format(amount)} ${currency}`
  }
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100)} ${currency}`
}

/** Formats an ISO 8601 timestamp for display in tables/detail views. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

/** Short relative-ish label for compact table cells. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(iso))
}

/** "partially_refunded" -> "partially refunded" — matches `StatusBadge`'s display convention. */
export function humanizeStatus(status: string): string {
  return status.replace(/_/g, ' ')
}

/** Builds `{ value, label }` filter options for a status union, in the given display order. */
export function statusFilterOptions<S extends string>(statuses: readonly S[]): { value: string; label: string }[] {
  return statuses.map((s) => ({ value: s, label: humanizeStatus(s) }))
}

/** Masks a secret/public API key for display, keeping the prefix + last 4 chars. */
export function maskKey(key: string): string {
  if (key.length <= 16) return key
  return `${key.slice(0, 12)}${'•'.repeat(20)}${key.slice(-4)}`
}

/** Triggers a browser download of an already-fetched blob (e.g. a CSV export). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** RFC 4180 field escaping for client-side CSV generation (e.g. DataTable's "Export selected"). */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Builds a CSV document from arbitrary rows given a set of `{ header, key, csvValue? }` columns. */
export function toCsv<TRow>(
  rows: TRow[],
  columns: { header: string; key: keyof TRow & string; csvValue?: (row: TRow) => string }[],
): string {
  const header = columns.map((c) => csvField(c.header)).join(',')
  const lines = rows.map((row) =>
    columns.map((c) => csvField(c.csvValue ? c.csvValue(row) : String(row[c.key] ?? ''))).join(','),
  )
  return [header, ...lines].join('\r\n')
}
