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
  TrackedLink: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
    className?: string
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}))

import { Nav } from './nav'

let root: Root | null = null
let host: HTMLElement | null = null

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<Nav />))
  return document.querySelector<HTMLButtonElement>('button[aria-controls="mobile-menu"]')!
}

function key(k: string, shiftKey = false) {
  const ev = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })
  act(() => {
    document.activeElement?.dispatchEvent(ev)
  })
  return ev
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('mobile menu focus management', () => {
  it('moves focus into the menu on open and keeps aria wiring', () => {
    const toggle = mount()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => toggle.click())
    const menu = document.getElementById('mobile-menu')!
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-controls')).toBe('mobile-menu')
    expect(menu.contains(document.activeElement)).toBe(true)
  })

  it('Escape closes and returns focus to the toggle', () => {
    const toggle = mount()
    act(() => toggle.click())
    key('Escape')
    expect(document.getElementById('mobile-menu')).toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle)
  })

  it('returns focus to the toggle when a menu link closes it', () => {
    const toggle = mount()
    act(() => toggle.click())
    act(() => document.querySelector<HTMLElement>('#mobile-menu a')!.click())
    expect(document.activeElement).toBe(toggle)
  })

  it('Tab and Shift+Tab wrap inside the toggle and menu', () => {
    const toggle = mount()
    act(() => toggle.click())
    const items = Array.from(document.querySelectorAll<HTMLElement>('#mobile-menu a[href], #mobile-menu button'))
    const last = items[items.length - 1]
    last.focus()
    expect(key('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(toggle)
    expect(key('Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })
})
