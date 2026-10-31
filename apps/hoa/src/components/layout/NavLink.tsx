'use client'

import Link from 'next/link'
import type { ComponentProps, ComponentType } from 'react'

// In the app router, next/link resolves to next/dist/client/app-dir/link
// (create-compiler-aliases.js), which takes `unstable_dynamicOnHover`. The
// public `next/link` types describe the pages-router Link and omit it.
const AppLink = Link as ComponentType<ComponentProps<typeof Link> & { unstable_dynamicOnHover?: boolean }>

// A next/link for the app's menus that loads the whole destination page on
// hover or touch, not just its loading.tsx skeleton. The pointer usually
// rests on a menu item for a few hundred ms before the click, which is
// enough for most pages to finish on the server, so the click shows real
// data instead of the skeleton. Only the hovered link renders, never the
// whole menu (BL-074, navigation-perf-ratchet.test.ts). Off in `next dev`.
export function NavLink(props: ComponentProps<typeof Link>) {
  return <AppLink {...props} unstable_dynamicOnHover />
}
