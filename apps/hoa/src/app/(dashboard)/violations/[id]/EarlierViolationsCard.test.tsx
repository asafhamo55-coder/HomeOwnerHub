import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as { React?: unknown }).React = React

import { EarlierViolationsCard } from './EarlierViolationsCard'

const props = { category: 'parking', allHref: '/violations?property=p1', retryHref: '/violations/v1' }

describe('EarlierViolationsCard', () => {
  it('says it could not load, never "none", when the read failed', () => {
    const html = renderToStaticMarkup(<EarlierViolationsCard {...props} result={{ ok: false }} />)
    expect(html).toContain('earlier violations')
    expect(html.toLowerCase()).toContain('load')
    expect(html).not.toContain('No other violations')
  })

  it('says none only when the read succeeded and found nothing', () => {
    const html = renderToStaticMarkup(<EarlierViolationsCard {...props} result={{ ok: true, data: [], count: null }} />)
    expect(html).toContain('No other violations at this home.')
  })

  it('lists same-category first, caps at ten and links to the full list', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `id${i}`,
      violation_type: i === 11 ? 'parking' : 'noise',
      status: 'resolved',
      created_at: `2026-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
      fine_amount: null,
    }))
    const html = renderToStaticMarkup(<EarlierViolationsCard {...props} result={{ ok: true, data: rows, count: null }} />)
    expect(new Set(html.match(/href="\/violations\/id\d+"/g) ?? []).size).toBe(10)
    expect(html.indexOf('/violations/id11')).toBeLessThan(html.indexOf('/violations/id10'))
    expect(html).toContain('10 of 12')
    expect(html).toContain('href="/violations?property=p1"')
  })

  it('renders nothing for a violation with no home', () => {
    expect(renderToStaticMarkup(<EarlierViolationsCard {...props} result={null} />)).toBe('')
  })
})
