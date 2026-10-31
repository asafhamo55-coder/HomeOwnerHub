// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('./command-palette', () => ({ CommandPalette: () => null }))
vi.mock('./tracked-link', () => ({
  TrackedLink: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
// Force the multi-product menu on so the Features menu renders.
vi.mock('../../lib/hubs', () => ({
  HOA_PRODUCT_NAME: 'HOA Hub',
  isOfferedHref: () => true,
}))

import { Nav } from './nav'

let root: Root | null = null
let host: HTMLElement | null = null

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<Nav />))
  return document.querySelector<HTMLButtonElement>('button[aria-controls="nav-features"]')!
}

function key(el: Element | null, k: string) {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  act(() => {
    el?.dispatchEvent(ev)
  })
  return ev
}

const items = () => Array.from(document.querySelectorAll<HTMLElement>('#nav-features a[href]'))

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('desktop Features menu keyboard support', () => {
  it.each(['ArrowDown', 'Enter', ' '])('%s opens it and focuses the first item', (k) => {
    const trigger = mount()
    trigger.focus()
    const ev = key(trigger, k)
    expect(ev.defaultPrevented).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(items()[0])
  })

  it('arrows move between items and wrap', () => {
    const trigger = mount()
    trigger.focus()
    key(trigger, 'ArrowDown')
    const list = items()
    expect(list.length).toBeGreaterThan(1)
    key(document.activeElement, 'ArrowDown')
    expect(document.activeElement).toBe(list[1])
    key(document.activeElement, 'ArrowUp')
    expect(document.activeElement).toBe(list[0])
    key(document.activeElement, 'ArrowUp')
    expect(document.activeElement).toBe(list[list.length - 1])
  })

  it('Escape closes and returns focus to the trigger', () => {
    const trigger = mount()
    trigger.focus()
    key(trigger, 'ArrowDown')
    key(document.activeElement, 'Escape')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('hover still opens it and leaving closes it', () => {
    const trigger = mount()
    const wrap = trigger.parentElement!
    act(() => {
      trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    act(() => {
      trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(wrap).toBeTruthy()
  })
})
