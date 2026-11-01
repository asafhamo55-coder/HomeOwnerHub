'use client'

import Link, { useLinkStatus } from 'next/link'
import type { ComponentProps, ComponentType } from 'react'

// In the app router, next/link resolves to next/dist/client/app-dir/link
// (create-compiler-aliases.js), which takes `unstable_dynamicOnHover`. The
// public `next/link` types describe the pages-router Link and omit it.
const AppLink = Link as ComponentType<ComponentProps<typeof Link> & { unstable_dynamicOnHover?: boolean }>

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

// A next/link for the app's menus that loads the whole destination page on
// hover or touch, not just the shared layout. The pointer usually rests on a
// menu item for a few hundred ms before the click, which is enough for most
// pages to finish on the server, so the click lands on data that is already
// there. Only the hovered link renders, never the whole menu (BL-074,
// navigation-perf-ratchet.test.ts). Off in `next dev`.
export function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <AppLink {...props} unstable_dynamicOnHover>
      {children}
      <PendingMark />
    </AppLink>
  )
}
