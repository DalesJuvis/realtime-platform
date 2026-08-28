import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * `crypto.randomUUID()` only exists in a secure context (HTTPS, or
 * `localhost` exactly) — opening this app over plain HTTP via a LAN IP
 * (a real thing people do while testing against a dev server on another
 * device) throws `crypto.randomUUID is not a function`. These IDs are
 * only ever used as local React list keys, never anything
 * security-sensitive, so a `Math.random()`-based fallback is fine here.
 */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
