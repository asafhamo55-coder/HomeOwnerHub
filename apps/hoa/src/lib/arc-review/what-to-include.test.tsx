import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WHAT_TO_INCLUDE, whatToInclude } from './what-to-include'

;(globalThis as { React?: typeof React }).React = React
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, refresh() {}, replace() {}, back() {} }) }))
vi.mock('@/lib/resident-submissions', () => ({ createArcRequest: async () => ({ ok: false, error: 'x' }) }))
vi.mock('@/components/ai/AiRewriteButton', () => ({ AiRewriteButton: () => null }))

const { CATEGORIES, ArcWhatToInclude } = await import('@/app/resident/arc/new/ArcRequestForm')

describe('what to include', () => {
  it('has 2 to 4 plain items for every category in the form', () => {
    for (const c of CATEGORIES) {
      const items = whatToInclude(c.value)
      expect(items.length, c.value).toBeGreaterThanOrEqual(2)
      expect(items.length, c.value).toBeLessThanOrEqual(4)
      for (const i of items) expect(i).not.toMatch(/—|§|statute/i)
    }
    expect(Object.keys(WHAT_TO_INCLUDE).sort()).toEqual(CATEGORIES.map((c) => c.value).sort())
  })

  it('returns nothing for an unknown or empty category', () => {
    expect(whatToInclude('')).toEqual([])
    expect(whatToInclude('toString')).toEqual([])
  })

  it('renders the list and the note once a category is chosen', () => {
    const out = renderToStaticMarkup(<ArcWhatToInclude category="fence" />)
    expect(out).toContain('You can add photos and plans after you submit.')
    expect(out).toContain('survey or plot plan')
  })

  it('renders nothing before a category is chosen', () => {
    expect(renderToStaticMarkup(<ArcWhatToInclude category="" />)).toBe('')
  })
})
