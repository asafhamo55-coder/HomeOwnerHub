'use client'

import { useEffect, useState } from 'react'

/**
 * Mount-once service worker registrar.
 *
 * - Registers /sw.js after the initial page is interactive (uses
 *   requestIdleCallback when available, fallback timeout otherwise).
 *   Never blocks the critical render path.
 * - Detects when a new SW has installed and is "waiting" (i.e. a deploy
 *   shipped while the user has the app open). Surfaces it via the
 *   updateAvailable state which the <UpdatePrompt> consumes.
 * - On "Update now" click, posts SKIP_WAITING to the waiting SW and
 *   reloads — the user gets the new app instantly.
 *
 * Dev: SW is intentionally NOT registered in development (Next's
 * hot-reload + SW caching = pain). Production only.
 */
export function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    let cancelled = false

    function register() {
      if (cancelled) return
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // If there's already a waiting worker at registration time,
          // an update is ready right now.
          if (reg.waiting) {
            setWaitingWorker(reg.waiting)
            setUpdateAvailable(true)
          }
          // Watch for future updates while the app is open.
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing
            if (!newWorker) return
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                // Old SW is in control AND new SW is installed = update ready.
                setWaitingWorker(newWorker)
                setUpdateAvailable(true)
              }
            })
          })
        })
        .catch(() => {
          // Registration failure is non-fatal. The app keeps working
          // exactly like it did before the SW existed.
        })
    }

    // Defer registration until the browser is idle so we don't compete
    // with the initial render for CPU/network.
    const idle =
      'requestIdleCallback' in window
        ? (window as Window & {
            requestIdleCallback: (cb: () => void) => number
          }).requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 1500)
    idle(register)

    return () => {
      cancelled = true
    }
  }, [])

  if (!updateAvailable || !waitingWorker) return null

  return (
    <UpdatePrompt
      onUpdate={() => {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' })
        // The new SW becomes controlling after skipWaiting + claim.
        // We listen for controllerchange and reload then.
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => window.location.reload(),
          { once: true },
        )
      }}
      onDismiss={() => setUpdateAvailable(false)}
    />
  )
}

/** Toast-style banner pinned to the bottom of the viewport. Pure
 *  inline styles so it works even if the app's stylesheet hasn't
 *  hydrated yet. */
function UpdatePrompt({
  onUpdate,
  onDismiss,
}: {
  onUpdate: () => void
  onDismiss: () => void
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        background: '#4F46E5',
        color: 'white',
        padding: '10px 14px',
        borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 9999,
        fontSize: 14,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <span>A new version of HOA Hub is ready.</span>
      <button
        type="button"
        onClick={onUpdate}
        style={{
          background: 'white',
          color: '#4F46E5',
          border: 'none',
          padding: '6px 12px',
          borderRadius: 6,
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Reload
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          color: 'white',
          border: 'none',
          padding: '4px 6px',
          cursor: 'pointer',
          opacity: 0.8,
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
