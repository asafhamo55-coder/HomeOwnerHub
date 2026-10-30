// @vitest-environment jsdom
// The /guides and /templates filter island: it narrows by title and
// description, shows an empty state, announces the count, and renders the whole
// list before any typing (which is also what a visitor without JS gets).

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

import { LibraryFilter } from './library-filter'
import { guideGroups } from '../../lib/library'

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function mount(): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const sections = guideGroups().map((g) => ({ id: g.id, label: g.label, items: g.items }))
  act(() => root!.render(<LibraryFilter sections={sections} linkLabel="Read the guide" kind="guide" noun="guides" />))
  return host
}

function type(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const total = guideGroups().reduce((n, g) => n + g.items.length, 0)

describe('library filter', () => {
  it('lists every guide before anything is typed, with a labelled search box and a count', () => {
    const h = mount()
    expect(h.querySelectorAll('li a').length).toBe(total)
    const input = h.querySelector('input[type="search"]') as HTMLInputElement
    expect(input).toBeTruthy()
    const label = h.querySelector(`label[for="${input.id}"]`)
    expect(label?.textContent).toMatch(/search guides/i)
    const status = h.querySelector('[role="status"][aria-live="polite"]')
    expect(status?.textContent).toBe(`${total} guides`)
  })

  it('narrows results to titles and descriptions that contain every word', () => {
    const h = mount()
    const input = h.querySelector('input[type="search"]') as HTMLInputElement
    type(input, 'california dispute')
    const hrefs = [...h.querySelectorAll('li a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/guides/california-hoa-internal-dispute-resolution')
    expect(hrefs.length).toBeGreaterThan(0)
    expect(hrefs.length).toBeLessThan(total)
    expect(h.querySelector('[role="status"]')?.textContent).toBe(`${hrefs.length} of ${total} guides match`)
    // A section with no match is dropped.
    expect(h.textContent).not.toContain('Texas')
  })

  it('shows an empty state with a way back when nothing matches', () => {
    const h = mount()
    const input = h.querySelector('input[type="search"]') as HTMLInputElement
    type(input, 'zzzz no such guide')
    expect(h.querySelectorAll('li a').length).toBe(0)
    expect(h.textContent).toMatch(/No guides match your search/)
    expect(h.querySelector('[role="status"]')?.textContent).toBe(`0 of ${total} guides match`)
    const back = [...h.querySelectorAll('button')].find((b) => /show all guides/i.test(b.textContent ?? ''))!
    act(() => back.click())
    expect(h.querySelectorAll('li a').length).toBe(total)
  })
})
