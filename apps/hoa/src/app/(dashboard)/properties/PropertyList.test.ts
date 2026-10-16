import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parsePropertyListParams } from '@/lib/properties/list-params'
import { PropertyList } from './PropertyList'

// BL-012: the empty property list carries the next action. createElement
// rather than JSX so this stays a plain .ts file under the root config.
// The root vitest config compiles app .tsx with the classic JSX runtime
// (Next uses the automatic one), so the component needs a global React.
;(globalThis as { React?: typeof React }).React = React
const h = React.createElement

const render = (raw: { filter?: string; q?: string }, noPropertiesYet?: boolean) =>
  renderToStaticMarkup(h(PropertyList, { rows: [], params: parsePropertyListParams(raw), noPropertiesYet }))

describe('PropertyList empty states', () => {
  it('an association with no homes is sent to add the first one, on any filter', () => {
    for (const filter of ['attention', 'all', 'leased']) {
      const html = render({ filter }, true)
      expect(html).toContain('No properties yet')
      expect(html).toContain('href="/properties/new"')
      expect(html).toContain('Add a property')
      expect(html).not.toContain('Show all properties')
    }
  })

  it('an empty filter on a populated association offers the unfiltered list', () => {
    const html = render({ filter: 'attention' }, false)
    expect(html).toContain('Nothing needs attention right now.')
    expect(html).toContain('href="/properties?filter=all"')
  })

  it('an unknown org count (failed read) falls back to the filter copy, not "No properties yet"', () => {
    const html = render({ filter: 'attention' })
    expect(html).not.toContain('No properties yet')
    expect(html).toContain('Show all properties')
  })

  it('a search with no matches keeps the search copy even with no homes', () => {
    const html = render({ filter: 'all', q: 'maple' }, true)
    expect(html).toContain('No properties match')
    expect(html).toContain('Show all properties')
  })
})
