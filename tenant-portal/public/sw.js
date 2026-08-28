/**
 * `sw.js` — Service worker: PWA installability + a minimal offline app
 * shell. No `push`/`notificationclick` handlers here — unlike
 * `web-client` (the end-user chat/notifications reference client), this
 * portal doesn't subscribe itself to Web Push; it's where a tenant
 * *manages* their workspace, not where they'd receive their own
 * platform's notifications.
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
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
  )
})
