/**
 * `sw.js` — Service worker: PWA installability, a minimal offline app
 * shell, and the `push` event handler that makes closed-tab notifications
 * possible at all (see `@mio/realtime-sdk`'s `notifications.ts` for the
 * client-side half — `subscribeToPush()` is what registers this worker
 * for push in the first place).
 *
 * **Offline scope, honestly:** this caches the navigation shell (`/`) so
 * a reload while offline doesn't hard-fail, not a full asset precache —
 * Vite's hashed build filenames change every deploy, and a real
 * content-hash-aware precache list needs build-time tooling (e.g.
 * `vite-plugin-pwa`/Workbox) this repo doesn't have wired up. Hashed JS/CSS
 * chunks are served network-first here and simply won't load offline on a
 * first-ever visit or after a deploy — acceptable for a reference client,
 * not a claim of full offline support.
 */

const CACHE_NAME = 'realtime-chat-shell-v1'
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
// the time this fires — `event.data` is the plain payload the server
// published (`PushFallbackService`/`WebPushAdapter` on the backend side
// of this repo just forward the message text as-is, no envelope format
// imposed on top).
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.text() : 'New message'
  event.waitUntil(
    self.registration.showNotification('Realtime Chat', {
      body: payload,
      icon: '/favicon.svg',
      tag: 'realtime-chat-push',
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
