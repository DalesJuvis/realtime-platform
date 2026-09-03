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

/**
 * `crypto.randomUUID()` only exists in a secure context (HTTPS, or
 * `localhost` exactly) — opening the dev server over a LAN IP or plain
 * HTTP throws `crypto.randomUUID is not a function`. `getRandomValues` has
 * no such restriction, so it's the fallback; a `Math.random` string is the
 * last resort for the id-less unlikely-JS-engine case. These ids are only
 * ever local React keys/dialog-stack identity, never security tokens, so
 * the fallbacks' weaker randomness is fine.
 */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * `navigator.clipboard` only exists in a secure context (HTTPS, or
 * `localhost` exactly) — same restriction as `crypto.randomUUID` (see
 * `randomId` above). Opening the app over a LAN IP or plain HTTP makes
 * `navigator.clipboard` undefined, so `.writeText` throws before any
 * copy actually happens — every "Copy" button would silently do nothing.
 * Falls back to the legacy `execCommand('copy')` trick (select the text
 * in a temporary offscreen `<textarea>`, then copy) — deprecated, but
 * still the standard workaround for a non-secure context.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Permission denied or similar — fall through to the legacy path.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  const succeeded = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!succeeded) {
    throw new Error('Copy to clipboard failed.')
  }
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

/**
 * Best-effort "Browser on OS" label from `navigator.userAgent`
 * ("Chrome on Windows", "Safari on iPhone") — used to tell a user's
 * several push-subscribed devices apart (see `registerPortalPushAction`).
 * No UA-parsing library: this only has to be good enough for a human
 * skimming a device list, not a precise device-detection system, and a
 * wrong guess is harmless (the subscription itself is keyed by push
 * endpoint, never by this label).
 */
export function guessDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown device'
  const ua = navigator.userAgent

  const os = (() => {
    if (/iPhone/.test(ua)) return 'iPhone'
    if (/iPad/.test(ua)) return 'iPad'
    if (/Android/.test(ua)) return 'Android'
    if (/Mac OS X/.test(ua)) return 'Mac'
    if (/Windows/.test(ua)) return 'Windows'
    if (/Linux/.test(ua)) return 'Linux'
    return null
  })()

  const browser = (() => {
    if (/Edg\//.test(ua)) return 'Edge'
    if (/OPR\//.test(ua)) return 'Opera'
    // Chrome's own UA also matches Safari's token, so it must be checked first.
    if (/Chrome\//.test(ua)) return 'Chrome'
    if (/CriOS\//.test(ua)) return 'Chrome'
    if (/FxiOS\//.test(ua)) return 'Firefox'
    if (/Firefox\//.test(ua)) return 'Firefox'
    if (/Safari\//.test(ua)) return 'Safari'
    return null
  })()

  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? 'Unknown device'
}

export type DeviceKind = 'mobile' | 'desktop' | 'other'

/**
 * Classifies a stored `device_label` (see `guessDeviceLabel` above) into
 * "mobile"/"desktop"/"other" for the device management page's icon and
 * filter — parses the label rather than needing its own backend field, so
 * it also works for rows registered before this classification existed.
 * `null` (no label at all — an older row, or a caller that never sent
 * one) falls into "other", the same as a label naming an OS this can't
 * place either way.
 */
export function classifyDeviceKind(deviceLabel: string | null): DeviceKind {
  if (!deviceLabel) return 'other'
  if (/iPhone|iPad|Android/.test(deviceLabel)) return 'mobile'
  if (/Windows|Mac|Linux/.test(deviceLabel)) return 'desktop'
  return 'other'
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
