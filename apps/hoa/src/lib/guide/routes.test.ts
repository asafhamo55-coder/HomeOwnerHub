import { describe, expect, it } from 'vitest'
import { listRouteFor, matchRouteTemplate, templateMatches } from './routes'

describe('templateMatches', () => {
  it('matches static and dynamic segments', () => {
    expect(templateMatches('/violations/[id]', '/violations/abc')).toBe(true)
    expect(templateMatches('/violations/[id]', '/violations')).toBe(false)
    expect(templateMatches('/meetings/[id]/packet', '/meetings/m1/packet')).toBe(true)
    expect(templateMatches('/', '/')).toBe(true)
    expect(templateMatches('/', '/dues')).toBe(false)
  })

  it('ignores a trailing slash and query string', () => {
    expect(templateMatches('/dues', '/dues/')).toBe(true)
    expect(templateMatches('/dues', '/dues?tab=1')).toBe(true)
  })

  it('supports catch-all segments', () => {
    expect(templateMatches('/docs/[...slug]', '/docs/a/b')).toBe(true)
    expect(templateMatches('/docs/[[...slug]]', '/docs')).toBe(true)
  })
})

describe('matchRouteTemplate', () => {
  const templates = ['/', '/violations', '/violations/[id]', '/violations/new', '/violations/approval-queue', '/meetings/[id]/packet', '/dues']

  it('prefers the most specific template: static beats dynamic', () => {
    expect(matchRouteTemplate('/violations/new', templates)).toBe('/violations/new')
    expect(matchRouteTemplate('/violations/abc', templates)).toBe('/violations/[id]')
    expect(matchRouteTemplate('/violations', templates)).toBe('/violations')
  })

  it('falls back to the nearest ancestor that has articles, but never to the dashboard', () => {
    expect(matchRouteTemplate('/dues/ledger/2026', templates)).toBe('/dues')
    expect(matchRouteTemplate('/accounting/invoices', templates)).toBeNull()
    expect(matchRouteTemplate('/', templates)).toBe('/')
  })

  it('matches multi-segment dynamic templates', () => {
    expect(matchRouteTemplate('/meetings/xyz/packet', templates)).toBe('/meetings/[id]/packet')
  })
})

describe('listRouteFor', () => {
  it('links to the list page when the route has a dynamic segment', () => {
    expect(listRouteFor('/properties/[id]')).toBe('/properties')
    expect(listRouteFor('/meetings/[id]/packet')).toBe('/meetings')
    expect(listRouteFor('/dues')).toBe('/dues')
    expect(listRouteFor('/[id]')).toBe('/')
  })
})
