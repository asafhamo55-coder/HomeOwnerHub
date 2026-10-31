// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }))

;(globalThis as { React?: unknown }).React = React
const { PublicBidForm } = await import('./PublicBidForm')

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

describe('PublicBidForm line item labels', () => {
  it('every line input carries its row number, and Remove names its line', () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const el = document.createElement('div')
    document.body.appendChild(el)
    root = createRoot(el)
    act(() => root!.render(<PublicBidForm token="t" />))
    const add = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Add line item'))!
    act(() => add.click())
    const labels = Array.from(el.querySelectorAll('[aria-label]')).map((n) => n.getAttribute('aria-label'))
    for (const row of [1, 2]) {
      for (const f of ['description', 'quantity', 'unit price', 'notes']) {
        expect(labels).toContain(`Line ${row} ${f}`)
      }
      expect(labels).toContain(`Remove line ${row}`)
    }
    expect(labels).not.toContain('Remove line')
  })
})
