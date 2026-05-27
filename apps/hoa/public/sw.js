/* HOA Hub service worker — minimal, defensive.
 *
 * Design goals:
 *   1. Never break the live app if the SW misbehaves. If anything in the
 *      fetch handler throws, fall through to the network — never serve
 *      a stale or broken cached response that blocks the user.
 *   2. Cache-first for /_next/static (immutable, fingerprinted JS/CSS/
 *      fonts that never change for a given hash) — instant repeat loads.
 *   3. Network-first for everything else. Auth-gated HTML pages must
 *      always reflect current data; we only fall back to the cache if
 *      the network is genuinely down.
 *   4. Offline fallback to /offline for HTML navigations when the
 *      network is unreachable AND we have no cached copy.
 *   5. Versioned cache name. Bumping the version on deploy evicts the
 *      old cache. Keep this in lock-step with the SW file changes —
 *      if the file changes, bump VERSION.
 *
 * Kill switch: serving the literal string KILL_SWITCH=true from
 * /sw-killswitch (if we ever add the route) would let the SW
 * unregister itself on next install. Not wired today; keep in mind
 * for emergency.
 */

const VERSION = 'v1.0.0'
const STATIC_CACHE = `hoa-static-${VERSION}`
const RUNTIME_CACHE = `hoa-runtime-${VERSION}`
const OFFLINE_URL = '/offline'

// Files we ALWAYS want available offline. The offline page itself goes
// here so an offline first-load can still render it.
const PRECACHE_URLS = [OFFLINE_URL]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Listen for the page asking to skip waiting (used by the update
// prompt — when the user taps "Reload", we tell this SW to take over).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET — POSTs (server actions, API mutations) must always
  // hit the network.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Skip cross-origin requests. We can't reliably cache Supabase, OG
  // image URLs, etc. — let the browser handle them normally.
  if (url.origin !== self.location.origin) return

  // Skip API + auth routes — they must always be fresh and may set
  // cookies that the cache would obliterate.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/logout')
  ) {
    return
  }

  // Strategy A: cache-first for fingerprinted static assets in
  // /_next/static. These never change for a given hash so caching
  // forever is correct.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Strategy B: cache-first for the PWA icon routes (apple-icon,
  // icon, manifest.webmanifest) — they don't change per render and
  // are referenced by iOS Safari + Android Chrome on every install.
  if (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/apple-icon' ||
    url.pathname === '/icon'
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Strategy C: network-first for everything else (HTML pages, RSC
  // payloads, server actions GET responses). Fall back to the cache
  // when offline. For HTML navigations specifically, fall back to
  // /offline if neither the network nor the cache has the page.
  event.respondWith(networkFirst(request))
})

async function cacheFirst(request) {
  try {
    const cached = await caches.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch (err) {
    // Last-ditch — return whatever we have cached even if stale.
    const cached = await caches.match(request)
    if (cached) return cached
    throw err
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      // Don't cache opaque or redirect responses — they're not useful
      // as fallback data.
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch (err) {
    const cached = await caches.match(request)
    if (cached) return cached
    // HTML navigation that has no cache → offline page.
    if (request.mode === 'navigate' || request.destination === 'document') {
      const offline = await caches.match(OFFLINE_URL)
      if (offline) return offline
    }
    throw err
  }
}
