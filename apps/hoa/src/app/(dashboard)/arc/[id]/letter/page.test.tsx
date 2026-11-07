import { beforeEach, describe, expect, it, vi } from 'vitest'

const ID = '11111111-2222-4333-8444-555555555555'

const h = vi.hoisted(() => ({
  role: 'board' as string | null,
  row: null as unknown,
  rowError: null as unknown,
  queried: 0,
  orgFilters: [] as unknown[],
  contacts: [{ label: 'President', name: 'Pat Board', phone: '404-555-0100', email: '' }] as unknown[],
  settingsError: null as unknown,
  assocs: {} as Record<string, { name: string; compliance_settings: unknown }>,
}))

class NotFound extends Error {}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('notFound')
  },
  unstable_rethrow: () => {},
}))
vi.mock('next/link', () => ({
  default: (p: { children?: unknown; href: string; className?: string }) => <a href={p.href} className={p.className}>{p.children as never}</a>,
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Peachtree Fixture HOA' } })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: (table: string) => {
      h.queried += 1
      const filters: Record<string, unknown> = {}
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          h.orgFilters.push([table, col, val])
          filters[col] = val
          return chain
        },
        is: () => chain,
        maybeSingle: async () => {
          if (table === 'associations') {
            const hit = h.settingsError ? null : (h.assocs[String(filters.id)] ?? null)
            return { data: hit, error: h.settingsError }
          }
          return { data: h.rowError ? null : h.row, error: h.rowError }
        },
      }
      return chain
    },
  })),
}))

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as { React?: unknown }).React = React
import Page from './page'
import { PrintArcLetterLink } from '../PrintArcLetterLink'

const LETTER = 'Your fence is approved.\nCondition 1: keep it under 6 feet.\nCondition 2: stain it a natural colour.'
const ROW = {
  id: ID,
  status: 'approved',
  summary: 'Back fence',
  board_response: LETTER,
  association_id: 'assoc-1',
  board_response_at: '2026-11-05T15:00:00Z',
  unit: { address_line1: '1234 PEACHTREE STREET NORTHEAST', address_line2: null, city: 'ATLANTA', state: 'GA', postal_code: '30309', unit_number: '5' },
  submitter: { full_name: 'Jane Owner' },
}

async function render() {
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ id: ID }) }))
}

beforeEach(() => {
  h.role = 'board'
  h.row = ROW
  h.rowError = null
  h.queried = 0
  h.orgFilters = []
  h.contacts = [{ label: 'President', name: 'Pat Board', phone: '404-555-0100', email: '' }]
  h.settingsError = null
  h.assocs = { 'assoc-1': { name: 'Peachtree Fixture HOA', compliance_settings: { board_contacts: h.contacts } } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ARC decision letter print view', () => {
  it('prints the stored letter word for word, with the owner, address, date and subject', async () => {
    const html = await render()
    expect(html).toContain('Your fence is approved.\nCondition 1: keep it under 6 feet.\nCondition 2: stain it a natural colour.')
    expect(html).toContain('whitespace-pre-wrap')
    expect(html).toContain('Jane Owner')
    expect(html).toContain('<p>1234 Peachtree St NE, #5</p>')
    expect(html).toContain('Dear Jane Owner,')
    expect(html).not.toContain('PEACHTREE STREET')
    expect(html).toContain('Atlanta, GA 30309')
    expect(html).toContain('Nov 5, 2026')
    expect(html).toContain('Architectural request: Back fence')
    expect(html).toContain('src="/brand-site/logo-full.svg"')
  })

  it.each([
    ['approved', 'Decision: Approved'],
    ['denied', 'Decision: Denied'],
  ])('prints the %s decision', async (status, line) => {
    h.row = { ...ROW, status, board_response: status === 'denied' ? 'We cannot approve this.' : LETTER }
    const html = await render()
    expect(html).toContain(line)
  })

  it('keeps the decision line exactly plain, with conditions only in the stored text', async () => {
    const html = await render()
    expect(html).toContain('<strong>Decision: Approved</strong>')
    expect(html).toContain('Condition 1: keep it under 6 feet.')
  })

  it('prints board contacts, or "Please contact the board." with a warning', async () => {
    let html = await render()
    expect(html).toContain('President, Pat Board, 404-555-0100')
    h.assocs['assoc-1'] = { name: 'Peachtree Fixture HOA', compliance_settings: { board_contacts: [] } }
    html = await render()
    expect(html).toContain('Please contact the board.')
    expect(html).toContain('No board contacts are set')
  })

  it('keeps a long letter whole, wraps it and keeps the signature together', async () => {
    const long = `${'y'.repeat(900)}\n${'Long sentence about the fence. '.repeat(120)}`
    h.row = { ...ROW, board_response: long }
    const html = await render()
    expect(html).toContain('y'.repeat(900))
    expect(html).toContain('[overflow-wrap:anywhere]')
    expect(html).toContain('break-inside:avoid')
    expect(html).toContain('text-[12pt]')
  })

  it('does not let board_response inject HTML or scripts', async () => {
    h.row = { ...ROW, board_response: '<script>alert(1)</script><img src=x onerror=alert(2)><b>bold</b>' }
    const html = await render()
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('hides the header in print and has no em dashes', async () => {
    const html = await render()
    const header = html.indexOf('data-testid="arc-letter-header"')
    const letter = html.indexOf('aria-label="ARC decision letter"')
    expect(header).toBeGreaterThan(-1)
    expect(letter).toBeGreaterThan(header)
    expect(html.slice(html.lastIndexOf('<div', header), header)).toContain('print:hidden')
    expect(html).toContain('<p class="print:hidden">')
    expect(html).toContain('size: letter')
    expect(html).toContain('min-h-12')
    expect(html).not.toContain('—')
  })

  it('scopes the read to the org', async () => {
    await render()
    expect(h.orgFilters).toContainEqual(['arc_requests', 'organization_id', 'org-1'])
    expect(h.orgFilters).toContainEqual(['associations', 'organization_id', 'org-1'])
    expect(h.orgFilters).toContainEqual(['associations', 'id', 'assoc-1'])
  })

  it('also serves an admin', async () => {
    h.role = 'admin'
    expect(await render()).toContain('Decision: Approved')
  })

  it.each(['resident', 'vendor', null])('is not found for %s, before any query', async (role) => {
    h.role = role
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBeInstanceOf(NotFound)
    expect(h.queried).toBe(0)
  })

  it('is not found for a request outside the org (no row)', async () => {
    h.row = null
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBeInstanceOf(NotFound)
  })

  it.each(['submitted', 'in_review'])('refuses an undecided request (%s)', async (status) => {
    h.row = { ...ROW, status }
    const html = await render()
    expect(html).toContain('Decide the request first')
    expect(html).not.toContain('Your fence is approved')
    expect(html).not.toContain('aria-label="ARC decision letter"')
  })

  it('says a withdrawn application was withdrawn', async () => {
    h.row = { ...ROW, status: 'withdrawn' }
    const html = await render()
    expect(html).toContain('This application was withdrawn')
    expect(html).toContain('The resident withdrew it, so there is no decision letter to print.')
    expect(html).not.toContain('Decide the request first')
    expect(html).not.toContain('aria-label="ARC decision letter"')
  })

  it('uses the request’s own association for the name and contacts', async () => {
    h.assocs = {
      'assoc-1': { name: 'First HOA', compliance_settings: { board_contacts: [{ label: 'President', name: 'Pat First', phone: '404-555-0100', email: '' }] } },
      'assoc-2': { name: 'Second HOA', compliance_settings: { board_contacts: [{ label: 'Chair', name: 'Sam Second', phone: '404-555-0199', email: '' }] } },
    }
    h.row = { ...ROW, association_id: 'assoc-2' }
    const html = await render()
    expect(html).toContain('Second HOA')
    expect(html).toContain('Sam Second')
    expect(html).not.toContain('First HOA')
    expect(html).not.toContain('Pat First')
    expect(h.orgFilters).toContainEqual(['associations', 'id', 'assoc-2'])
    expect(h.orgFilters).toContainEqual(['associations', 'organization_id', 'org-1'])
  })

  it('warns, print-hidden, and prints today when the decision has no date', async () => {
    h.row = { ...ROW, board_response_at: null }
    const html = await render()
    expect(html).toContain('This decision has no saved date')
    expect(html.indexOf('This decision has no saved date')).toBeLessThan(html.indexOf('aria-label="ARC decision letter"'))
    expect(html).not.toContain('Nov 5, 2026')
  })

  it('leaves out the salutation when the owner name is not set', async () => {
    h.row = { ...ROW, submitter: { full_name: null } }
    expect(await render()).not.toContain('Dear ')
  })
})

describe('fail closed', () => {
  it.each([
    ['the request read fails', () => (h.rowError = { code: '57014', message: 'timeout' })],
    ['the contacts read fails', () => (h.settingsError = { code: '57014', message: 'timeout' })],
  ])('shows LoadFailed and no letter when %s', async (_name, arrange) => {
    arrange()
    const html = await render()
    expect(html).toContain('Couldn’t load the decision letter')
    expect(html).not.toContain('Your fence is approved')
    expect(html).not.toContain('Jane Owner')
  })
})

describe('PrintArcLetterLink', () => {
  it('links to the letter with a 48px target, hidden in print', () => {
    const html = renderToStaticMarkup(<PrintArcLetterLink arcId={ID} />)
    expect(html).toContain(`href="/arc/${ID}/letter"`)
    expect(html).toContain('Print the letter')
    expect(html).toContain('min-h-12')
    expect(html).toContain('print:hidden')
  })
})
