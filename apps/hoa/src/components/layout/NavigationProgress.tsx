'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Top progress bar that shows the instant the user clicks a same-origin
 * link, before the server response (or the route's loading.tsx skeleton)
 * arrives. Pure client component — no server-side risk.
 *
 * How it works:
 *   1. Captures click events at the document level. If the click target
 *      is a same-origin <a> (which Next's <Link> renders to) and isn't
 *      a modifier click / new-tab / hash-only link, show the bar.
 *   2. usePathname() change ⇒ navigation completed ⇒ hide the bar.
 *   3. The bar uses a CSS keyframe animation that ramps width from 0 to
 *      ~95% over ~1.5s — feels like "we're working on it" rather than
 *      a misleading "we're 95% done" claim.
 *
 * Behavior we DON'T want:
 *   - Flicker on programmatic router.push from buttons (we don't intercept
 *     those — those flows usually show their own pending state).
 *   - Show for in-page anchor jumps (#section).
 *   - Show for external links / target="_blank".
 *   - Show for cmd/ctrl/shift/alt clicks (browser opens in new tab).
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const lastPathname = useRef(pathname)
  const [isPending, setIsPending] = useState(false)

  // Detect navigation START — click on a same-origin link.
  useEffect(() => {
    function isModifiedEvent(e: MouseEvent): boolean {
      return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
    }
    function handleClick(e: MouseEvent) {
      if (isModifiedEvent(e)) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const link = target.closest('a') as HTMLAnchorElement | null
      if (!link) return
      // Skip explicit new-tab / external links.
      if (link.target && link.target !== '' && link.target !== '_self') return
      // Skip hash-only / no-href links.
      const href = link.getAttribute('href')
      if (!href) return
      if (href.startsWith('#')) return
      // Same-origin check — link.host empty for in-DOM relative hrefs is OK.
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

  // Detect navigation END — pathname change.
  useEffect(() => {
    if (lastPathname.current !== pathname) {
      lastPathname.current = pathname
      setIsPending(false)
    }
  }, [pathname])

  // Safety: auto-hide after 8s in case a navigation never completes
  // (e.g. server error suppressed by error boundary, popstate, etc.)
  useEffect(() => {
    if (!isPending) return
    const t = window.setTimeout(() => setIsPending(false), 8000)
    return () => window.clearTimeout(t)
  }, [isPending])

  if (!isPending) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-transparent"
    >
      <div className="h-full origin-left bg-primary shadow-[0_0_8px_hsl(var(--primary))] nav-progress-bar" />
    </div>
  )
}
