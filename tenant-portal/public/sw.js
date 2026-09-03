/**
 * `sw.js` — Service worker: PWA installability, a minimal offline app
 * shell, and (per `registerPortalPush.action.ts`) real Web Push — a
 * tenant admin can opt in from Settings to be notified of their own
 * tenant's channel activity even with this dashboard closed. Previously
 * this file deliberately had no `push` handler, on the reasoning that
 * "this is where you manage the workspace, not where you'd receive its
 * notifications" — revisited: an admin who's stepped away from the
 * dashboard is exactly who wants to know something happened on their
 * tenant without needing the tab open.
 *
 * **Offline scope, honestly:** caches the navigation shell (`/`) so a
 * reload while offline doesn't hard-fail, not a full asset precache —
 * Vite's hashed build filenames change every deploy, and a real
 * content-hash-aware precache list needs build-time tooling (e.g.
 * `vite-plugin-pwa`/Workbox) this repo doesn't have wired up. Hashed JS/CSS
 * chunks are served network-first here and simply won't load offline on a
 * first-ever visit or after a deploy — acceptable for installability, not
 * a claim of full offline support.
 */

const CACHE_NAME = 'mio-portal-shell-v1'
const SHELL_URLS = ['/', '/manifest.json', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)))
  // No self.skipWaiting() here on purpose: a newly-installed worker now
  // stays in the "waiting" state (instead of taking over immediately)
  // until the page's own update-available prompt tells it to via the
  // message listener below — see main.tsx's registration code. Without
  // this, a deploy would silently swap the worker under an already-open
  // tab while that tab kept running its old, already-loaded JS bundle —
  // update applied, nothing visibly changed until an unrelated reload.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
  )
})

// The browser has already decrypted the Web Push payload (RFC 8291) by
// the time this fires — `event.data` is the plain message text this
// platform's own backend forwards as-is (see `WebPushAdapter`/
// `PushFallbackService`), no envelope format imposed on top.
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.text() : 'New activity'
  event.waitUntil(
    self.registration.showNotification('mio', {
      body: payload,
      icon: '/favicon.svg',
      tag: 'mio-portal-push',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    }),
  )
})
