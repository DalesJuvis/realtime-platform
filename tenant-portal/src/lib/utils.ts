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

/**
 * Derives the WS host from the connected Portal API URL — same host,
 * different port: this project always runs WS on 8080 alongside Portal on
 * 8090 for a given engine instance (see `docker-compose.yml`'s
 * per-instance port block; same convention `admin`'s `deriveWsHost` uses
 * for its own Sandbox feature), so there's no separate "WS URL" setting
 * to ask the tenant for.
 */
export function deriveWsHost(portalApiUrl: string): string {
  try {
    return new URL(portalApiUrl).hostname
  } catch {
    return 'localhost'
  }
}

/**
 * Human-friendly duration for a `ttl_secs`-shaped value — a minted token
 * can now run from the 1-hour default up to the backend's 30-day cap
 * (`MintClientTokenUseCase::MAX_TTL_SECS`), where "Expires in 43200 min"
 * would be unreadable. Picks the single largest whole unit that fits
 * rather than a full breakdown (e.g. "2 days", not "2 days 3 hours") —
 * this is a rough "how long do I have" glance, not a precise countdown.
 */
export function formatDuration(totalSeconds: number): string {
  const units: { label: string; secs: number }[] = [
    { label: 'day', secs: 86400 },
    { label: 'hour', secs: 3600 },
    { label: 'minute', secs: 60 },
  ]
  for (const { label, secs } of units) {
    if (totalSeconds >= secs) {
      const count = Math.round(totalSeconds / secs)
      return `${count} ${label}${count === 1 ? '' : 's'}`
    }
  }
  return `${Math.max(0, Math.round(totalSeconds))} second${totalSeconds === 1 ? '' : 's'}`
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
