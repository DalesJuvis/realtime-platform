/**
 * # platform
 *
 * Detects Apple platforms (iOS/iPadOS/macOS) once at module load, so chrome
 * surfaces (sidebar, banners, toolbars, sheets) can opt into a translucent
 * glassmorphism treatment there and keep the flat design everywhere else —
 * `backdrop-filter` blur is a native, deeply-idiomatic pattern on those
 * platforms (menu bar, Control Center, sheets) and looks out of place as a
 * blanket default on Windows/Linux/Android.
 */

function detectApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false

  const uaPlatform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform
  if (uaPlatform) return /mac/i.test(uaPlatform)

  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}

export const isApplePlatform = detectApplePlatform()
