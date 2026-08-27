import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

/** Date-only variant of `formatDateTime` for compact table cells. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(iso))
}

/** Masks a secret/public API key for display, keeping the prefix + last 4 chars. */
export function maskKey(key: string): string {
  if (key.length <= 16) return key
  return `${key.slice(0, 12)}${'•'.repeat(20)}${key.slice(-4)}`
}

/**
 * Friendly workspace label derived from the signed-in email's local part
 * (`lingha@example.com` -> `Lingha`) — this app has no company-name/logo
 * field to show instead (unlike saas-admin's `tenantName`/uploaded logo).
 */
export function workspaceNameFromEmail(email: string | null): string {
  if (!email) return 'Workspace'
  const local = email.split('@')[0] ?? ''
  return local.length > 0 ? local.charAt(0).toUpperCase() + local.slice(1) : 'Workspace'
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

/** RFC 4180 field escaping for client-side CSV generation (DataTable's export). */
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
