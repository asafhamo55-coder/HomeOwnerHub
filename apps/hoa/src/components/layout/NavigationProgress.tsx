'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Past this long with no page, say so: with no loading skeleton the old page
// stays on screen, and a bar alone can look stuck to someone waiting.
const SLOW_AFTER_MS = 3000
// Safety net if a navigation never completes (popstate, a suppressed error).
const GIVE_UP_AFTER_MS = 20000

/**
 * Top progress bar that shows the instant the user taps a same-origin link.
 * Route-level loading.tsx skeletons are gone (navigation-perf-ratchet.test.ts),
 * so the page being left stays visible until the next one is ready, and this
 * bar is the "your tap worked" signal. Pure client component.
 *
 * How it works:
 *   1. Captures click events at the document level (a tap on iOS Safari
 *      fires `click` on anchors too). If the click target is a same-origin
 *      http(s) <a> that is not a modifier click / new-tab / download /
 *      hash-only link, show the bar.
 *   2. A change of pathname OR query string means the new page committed,
 *      so hide the bar.
 *   3. After SLOW_AFTER_MS a small "Still loading" note appears, so a slow
 *      page never looks frozen.
 *
 * Mount it inside <Suspense> (useSearchParams).
 *
 * Behavior we DON'T want:
 *   - Show for in-page anchor jumps (#section), mailto:/tel:, downloads.
 *   - Show for external links / target="_blank".
 *   - Show for cmd/ctrl/shift/alt clicks (browser opens in new tab).
 * Programmatic router.push from buttons is not intercepted; those flows show
 * their own pending state.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const here = `${pathname}?${search}`
  const lastHere = useRef(here)
  const [isPending, setIsPending] = useState(false)
  const [isSlow, setIsSlow] = useState(false)

  // Detect navigation START — click on a same-origin link.
  useEffect(() => {
    function isModifiedEvent(e: MouseEvent): boolean {
      return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
    }
    function handleClick(e: MouseEvent) {
      if (isModifiedEvent(e)) return
      const target = e.target as Element | null
      if (!target || typeof target.closest !== 'function') return
      const link = target.closest('a') as HTMLAnchorElement | null
      if (!link) return
      // Skip explicit new-tab / external links and downloads.
      if (link.target && link.target !== '' && link.target !== '_self') return
      if (link.hasAttribute('download')) return
      // Skip hash-only / no-href links.
      const href = link.getAttribute('href')
      if (!href) return
      if (href.startsWith('#')) return
      // Only http(s) on this origin (not mailto:, tel:, other hosts).
      if (link.protocol !== 'http:' && link.protocol !== 'https:') return
      if (link.host && link.host !== window.location.host) return
      // Skip if same URL — no navigation will happen.
      if (link.pathname === window.location.pathname && link.search === window.location.search) {
        return
      }
      setIsPending(true)
    }
    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [])

  // Detect navigation END — pathname or query string change.
  useEffect(() => {
    if (lastHere.current !== here) {
      lastHere.current = here
      setIsPending(false)
    }
  }, [here])

  // Slow-wait note, and the safety net.
  useEffect(() => {
    if (!isPending) {
      setIsSlow(false)
      return
    }
    const slow = window.setTimeout(() => setIsSlow(true), SLOW_AFTER_MS)
    const giveUp = window.setTimeout(() => setIsPending(false), GIVE_UP_AFTER_MS)
    return () => {
      window.clearTimeout(slow)
      window.clearTimeout(giveUp)
    }
  }, [isPending])

  if (!isPending) return null

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-transparent"
      >
        <div className="h-full origin-left bg-primary shadow-[0_0_8px_hsl(var(--primary))] nav-progress-bar" />
      </div>
      {isSlow && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center px-4 print:hidden"
        >
          <span className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-lg">
            Still loading, one moment.
          </span>
        </div>
      )}
    </>
  )
}
