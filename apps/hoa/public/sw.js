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
 *   6. Web Push. The 'push' and 'notificationclick' handlers below are
 *      the ONLY way a board member hears about a new ticket while the
 *      app is closed — no page is running at that moment, so nothing
 *      else in the app can react. See
 *      docs/superpowers/specs/2026-08-31-ticket-notifications-design.md.
 *
 * Kill switch: serving the literal string KILL_SWITCH=true from
 * /sw-killswitch (if we ever add the route) would let the SW
 * unregister itself on next install. Not wired today; keep in mind
 * for emergency.
 */

const VERSION = 'v1.1.0'
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

// ─── Web Push ────────────────────────────────────────────────────────
//
// Notification icons. Both are Next route handlers (app/icon.tsx,
// app/apple-icon.tsx) and are already precached cache-first by the fetch
// handler above, so showing a notification does not need the network.
const NOTIFICATION_ICON = '/apple-icon'
const NOTIFICATION_BADGE = '/icon'
const DEFAULT_NOTIFICATION = {
  title: 'HOA Hub',
  body: 'You have a new notification.',
  link: '/',
  tag: 'hoa-generic',
}

/**
 * A push arrived. The sender (packages/jobs) posts an encrypted JSON body
 * of { title, body, link, tag }.
 *
 * Everything here is defensive on purpose. If this handler throws, or if
 * it resolves without calling showNotification, the browser enforces the
 * userVisibleOnly contract by showing ITS OWN notification — a generic
 * "This site has been updated in the background" from an unnamed site.
 * That looks broken to the user and there is no way to suppress it after
 * the fact, so an unreadable payload must still produce something sane
 * rather than propagate.
 */
self.addEventListener('push', (event) => {
  let payload = DEFAULT_NOTIFICATION

  try {
    // event.data is null for a "tickle" push (no body). Some push
    // services also deliver a body that isn't JSON at all; .json()
    // throws synchronously on those, hence the try around both.
    const parsed = event.data ? event.data.json() : null
    if (parsed && typeof parsed === 'object') {
      payload = {
        title: typeof parsed.title === 'string' ? parsed.title : DEFAULT_NOTIFICATION.title,
        body: typeof parsed.body === 'string' ? parsed.body : DEFAULT_NOTIFICATION.body,
        link: typeof parsed.link === 'string' ? parsed.link : DEFAULT_NOTIFICATION.link,
        tag: typeof parsed.tag === 'string' ? parsed.tag : DEFAULT_NOTIFICATION.tag,
      }
    }
  } catch {
    // Keep DEFAULT_NOTIFICATION. A generic notification the user can tap
    // through to the app beats the browser's own "site updated" banner.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Same tag = the OS replaces the previous banner instead of
      // stacking. The sender keys this per entity (e.g. ticket:<id>) so
      // a retried job can't produce two banners for one ticket.
      tag: payload.tag,
      // notificationclick reads this back — the event carries the
      // notification, not the original push payload.
      data: { link: payload.link },
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
    }),
  )
})

/**
 * The user tapped the notification. Focus the app if it is already open
 * anywhere, otherwise open a window. Opening unconditionally would leave
 * a board member with a pile of duplicate tabs.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const link =
    (event.notification.data && event.notification.data.link) ||
    DEFAULT_NOTIFICATION.link
  const targetUrl = new URL(link, self.location.origin)

  event.waitUntil(
    (async () => {
      // includeUncontrolled: true matters — a tab loaded BEFORE this SW
      // version activated is not controlled by it, and without this flag
      // it is invisible here, so we would open a second window on top of
      // the app the user already has open.
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Prefer a client already sitting on the target page; otherwise
      // reuse any open window and navigate it there.
      let fallback = null
      for (const client of clientList) {
        if (client.url === targetUrl.href) {
          return client.focus()
        }
        if (!fallback) fallback = client
      }

      if (fallback) {
        // navigate() is not implemented everywhere (notably older
        // WebKit); focusing without navigating is still better than a
        // duplicate window, so treat the failure as non-fatal.
        if (typeof fallback.navigate === 'function') {
          try {
            const navigated = await fallback.navigate(targetUrl.href)
            if (navigated) return navigated.focus()
          } catch {
            // fall through to a plain focus
          }
        }
        return fallback.focus()
      }

      return self.clients.openWindow(targetUrl.href)
    })(),
  )
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
