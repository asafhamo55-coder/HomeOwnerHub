// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { ProductTour, TOUR_TABS } from './product-tour'

let root: Root | null = null
let host: HTMLElement | null = null

function mount() {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<ProductTour />))
}

const tabs = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))
const panels = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'))

function key(k: string) {
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.useRealTimers()
})

describe('product tour tablist', () => {
  it('starts on the first tab with one visible panel and roving tabindex', () => {
    mount()
    expect(tabs()).toHaveLength(TOUR_TABS.length)
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1])
    expect(panels().filter((p) => !p.hidden)).toHaveLength(1)
    expect(panels()[0]!.hidden).toBe(false)
  })

  it('arrow keys move selection, focus and the visible panel, wrapping at the ends', () => {
    mount()
    tabs()[0]!.focus()
    key('ArrowRight')
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[1])
    expect(panels()[1]!.hidden).toBe(false)
    expect(panels()[0]!.hidden).toBe(true)
    key('ArrowLeft')
    key('ArrowLeft')
    expect(tabs()[4]!.getAttribute('aria-selected')).toBe('true')
    expect(panels()[4]!.hidden).toBe(false)
    key('Home')
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true')
    key('End')
    expect(tabs()[4]!.getAttribute('aria-selected')).toBe('true')
  })

  it('wires each tab to its panel and never rotates on its own', () => {
    mount()
    for (const t of tabs()) {
      const panel = document.getElementById(t.getAttribute('aria-controls')!)!
      expect(panel.getAttribute('aria-labelledby')).toBe(t.id)
    }
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true')
  })

  it('click selects a tab', () => {
    mount()
    act(() => tabs()[2]!.click())
    expect(panels()[2]!.hidden).toBe(false)
  })
})
