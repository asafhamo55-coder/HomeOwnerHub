'use client'

import Link, { useLinkStatus } from 'next/link'
import { useState, type ComponentProps } from 'react'

// Renders inside the Link, so useLinkStatus reports on this link only. While
// the tapped page loads, the old page stays on screen, so the tapped menu
// item has to show that the tap landed. This is a zero-size, out-of-flow
// marker (no layout shift, no flex gap); globals.css pulses the anchor that
// contains it.
function PendingMark() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return <span aria-hidden="true" data-link-pending="" className="pointer-events-none absolute h-0 w-0" />
}

// A next/link for the app's menus that stays quiet until the person shows
// interest, then loads the WHOLE destination page.
//
// Resting state is `prefetch={false}`: a menu of ~20 links in view used to
// fire ~20 background requests on every full page load, each running the
// middleware and a server render, and every one of them a cache miss that
// competed with the page the person actually asked for. Because the board
// pages have no loading.tsx, those automatic prefetches only fetched an
// empty shell anyway (nothing the click could reuse).
//
// On hover, keyboard focus or touch the link flips to `prefetch={true}`, a
// full prefetch of that one page. The pointer usually rests on a menu item
// for a few hundred ms before the click, which is enough for most pages to
// finish on the server, so the click lands on data that is already there.
// Only the touched link renders, never the whole menu (BL-074,
// navigation-perf-ratchet.test.ts). Prefetching is off in `next dev`.
export function NavLink({ children, prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [armed, setArmed] = useState(false)
  const arm = () => setArmed(true)
  // A caller that sets `prefetch` itself keeps control of it.
  const mode = prefetch !== undefined ? prefetch : armed
  return (
    <Link
      {...props}
      prefetch={mode}
      onMouseEnter={(e) => {
        arm()
        onMouseEnter?.(e)
      }}
      onTouchStart={(e) => {
        arm()
        onTouchStart?.(e)
      }}
      onFocus={(e) => {
        arm()
        onFocus?.(e)
      }}
    >
      {children}
      <PendingMark />
    </Link>
  )
}
