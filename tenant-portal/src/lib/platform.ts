/**
 * # isApplePlatform
 *
 * True on macOS, iOS, and iPadOS — iPadOS Safari reports `navigator.platform`
 * as `"MacIntel"` (desktop-Safari spoofing), which is exactly the "looks
 * like Mac" signal callers here want, not a bug to work around. Computed
 * once at module load: this is a client-only SPA (see main.tsx's
 * `createRoot`), so `navigator` is always available and the platform never
 * changes mid-session.
 */
export const isApplePlatform = /Mac|iPhone|iPad|iPod/.test(`${navigator.platform} ${navigator.userAgent}`)
