'use client'

import * as React from 'react'

/**
 * Arrow-key (and j/k) movement between the property rows' links, with
 * Home/End to jump. Each row's address link carries `data-row-link`;
 * Tab still walks every control, and Enter on a focused row opens it
 * (it is a link). Wraps server-rendered rows, so the table itself stays
 * a server component.
 */
export function RowKeyNav({ children, className }: { children: React.ReactNode; className?: string }) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-row-link]')).filter(
      (el) => el.offsetParent !== null, // the visible layout only (table or cards)
    )
    if (links.length === 0) return
    const target = e.target as HTMLElement
    // Any control inside the current row counts as "on" that row.
    const current = links.findIndex((l) => l === target || l.closest('[data-row], tr')?.contains(target))
    let next = -1
    if (e.key === 'ArrowDown' || e.key === 'j') next = current < 0 ? 0 : Math.min(current + 1, links.length - 1)
    else if (e.key === 'ArrowUp' || e.key === 'k') next = current < 0 ? 0 : Math.max(current - 1, 0)
    else if (e.key === 'Home' && current >= 0) next = 0
    else if (e.key === 'End' && current >= 0) next = links.length - 1
    else return
    e.preventDefault()
    links[next]?.focus()
  }
  return (
    // The rows' links are the interactive elements; this only relays keys.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}
