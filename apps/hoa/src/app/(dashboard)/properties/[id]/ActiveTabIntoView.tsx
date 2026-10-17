'use client'

import { useEffect, useRef } from 'react'

/**
 * Centres the active tab in its horizontally scrolling strip. At 375 the
 * seven property tabs overflow, and opening "History" from a link left the
 * active tab off-screen. Scrolls only the strip (scrollLeft), never the
 * page. Renders an empty, hidden marker; the strip is its previous sibling.
 */
export function ActiveTabIntoView() {
  const marker = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const nav = marker.current?.previousElementSibling as HTMLElement | null
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    const left = active.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft
    nav.scrollLeft = Math.max(0, left - (nav.clientWidth - active.offsetWidth) / 2)
  })
  return <span ref={marker} hidden />
}
