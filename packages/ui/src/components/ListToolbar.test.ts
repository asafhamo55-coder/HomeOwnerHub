import { describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FilterChips } from './ListToolbar'

describe('FilterChips at 375px', () => {
  // inbox--375 / communications-results--375: the chips scrolled sideways
  // and cut off the last one with no hint. They wrap instead.
  const html = renderToStaticMarkup(
    h(FilterChips, {
      label: 'Filter conversations',
      items: ['Needs review', 'Awaiting resident', 'Open', 'Waiting', 'Closed', 'All'].map((l, i) => ({
        label: l,
        href: `/inbox?f=${i}`,
        active: i === 0,
        count: i,
      })),
    }),
  )

  it('wraps rather than scrolling sideways', () => {
    expect(html).toMatch(/<ul class="[^"]*\bflex-wrap\b/)
    expect(html).not.toContain('overflow-x-auto')
    expect(html).not.toContain('min-w-max')
  })

  it('keeps every chip a link, the active one marked', () => {
    expect(html.match(/<a /g)).toHaveLength(6)
    expect(html).toContain('aria-current="true"')
  })
})
