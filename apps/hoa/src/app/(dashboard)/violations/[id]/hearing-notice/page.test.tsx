import { beforeEach, describe, expect, it, vi } from 'vitest'

const ID = '11111111-2222-4333-8444-555555555555'

const h = vi.hoisted(() => ({
  role: 'board' as string | null,
  row: null as unknown,
  rowError: null as unknown,
  hearing: null as unknown,
  hearingKind: 'ok' as 'ok' | 'failed' | 'off',
  state: 'FL' as string | null,
  rulesFail: false,
  queried: 0,
  orgFilters: [] as unknown[],
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
    from: () => {
      h.queried += 1
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          h.orgFilters.push([col, val])
          return chain
        },
        is: () => chain,
        maybeSingle: async () => ({ data: h.rowError ? null : h.row, error: h.rowError }),
      }
      return chain
    },
  })),
}))
vi.mock('@/lib/primary-association', () => ({
  getPrimaryAssociationResult: vi.fn(async () => ({ ok: true, data: { id: 'a1', name: 'Peachtree Fixture HOA', timeZone: 'America/New_York' }, count: null })),
}))
vi.mock('@/lib/violation-cure-commitment', () => ({
  loadOrgStateRules: vi.fn(async () => {
    if (h.rulesFail) throw new Error('boom')
    return { state: h.state }
  }),
}))
vi.mock('@/lib/violation-hearings/queries', () => ({
  loadBoardHearing: vi.fn(async () => (h.hearingKind === 'ok' ? { kind: 'ok', hearing: h.hearing } : { kind: h.hearingKind })),
}))

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as { React?: unknown }).React = React
import Page from './page'
import { HearingNoticePrint } from './HearingNoticePrint'
import { PrintHearingNoticeLink } from '../PrintHearingNoticeLink'
import { buildHearingNoticeDraft } from '@/lib/violation-hearings/rules'

const VIOLATION = {
  id: ID,
  violation_type: 'unapproved_fence',
  description: 'A fence was built without approval.',
  ccr_section: 'Section 4.2',
  property: { address: '1234 PEACHTREE STREET NORTHEAST, ATLANTA, GA 30309', unit_number: '5', owner_name: 'Jane Owner' },
}
const HEARING = { hearingOn: '2026-12-10', hearingTime: '19:00', location: 'Clubhouse <Room 2>' }

async function render() {
  const el = await Page({ params: Promise.resolve({ id: ID }) })
  return renderToStaticMarkup(el)
}

beforeEach(() => {
  h.role = 'board'
  h.row = VIOLATION
  h.rowError = null
  h.hearing = HEARING
  h.hearingKind = 'ok'
  h.state = 'FL'
  h.rulesFail = false
  h.queried = 0
  h.orgFilters = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('hearing notice print view', () => {
  it.each(['FL', 'CA', 'GA', null])('prints exactly the email draft body for state %s', async (state) => {
    h.state = state
    const html = await render()
    const draft = buildHearingNoticeDraft({
      state,
      associationName: 'Peachtree Fixture HOA',
      violationType: VIOLATION.violation_type,
      description: VIOLATION.description,
      ruleCited: VIOLATION.ccr_section,
      hearingOn: HEARING.hearingOn,
      hearingTime: HEARING.hearingTime,
      location: HEARING.location,
    })
    expect(html).toContain(draft.bodyHtml)
    expect(html).toContain(draft.subject)
    expect(html).toContain('Clubhouse &lt;Room 2&gt;')
  })

  it('shows letterhead, owner and the standard USPS address', async () => {
    const html = await render()
    expect(html).toContain('src="/brand-site/logo-full.svg"')
    expect(html).toContain('Jane Owner')
    expect(html).toContain('1234 Peachtree St NE')
    expect(html).not.toContain('PEACHTREE STREET')
    expect(html).toContain('Atlanta, GA 30309')
  })

  it('scopes the reads to the org', async () => {
    await render()
    expect(h.orgFilters).toContainEqual(['org_id', 'org-1'])
  })

  it('uses 12pt body text, 44px-plus targets and no em dashes', async () => {
    const html = await render()
    expect(html).toContain('text-[12pt]')
    expect(html).toContain('min-h-12')
    expect(html).not.toContain('—')
  })

  it('hides the header in print and prints nothing above the letter', async () => {
    const html = await render()
    const header = html.indexOf('data-testid="hearing-notice-header"')
    const letter = html.indexOf('aria-label="Hearing notice"')
    expect(header).toBeGreaterThan(-1)
    expect(letter).toBeGreaterThan(header)
    expect(html.slice(html.lastIndexOf('<div', header), header)).toContain('print:hidden')
    // the back link is hidden too
    expect(html).toContain('<p class="print:hidden">')
    // @page letter
    expect(html).toContain('size: letter')
  })

  it('also serves an admin', async () => {
    h.role = 'admin'
    expect(await render()).toContain('Notice of hearing')
  })

  it.each(['resident', 'vendor', null])('is not found for %s, before any query', async (role) => {
    h.role = role
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBeInstanceOf(NotFound)
    expect(h.queried).toBe(0)
  })

  it('is not found for a violation outside the org (no row)', async () => {
    h.row = null
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBeInstanceOf(NotFound)
  })

  it('is not found when hearings are not switched on', async () => {
    h.hearingKind = 'off'
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBeInstanceOf(NotFound)
  })

  it('asks the board to record the hearing instead of printing placeholders', async () => {
    h.hearing = null
    const html = await render()
    expect(html).toContain('Record the hearing first')
    expect(html).not.toContain('Dear Homeowner')
  })
})

describe('fail closed', () => {
  it.each([
    ['the violation read fails', () => (h.rowError = { code: '57014', message: 'timeout' })],
    ['the hearing read fails', () => (h.hearingKind = 'failed')],
    ['the state read fails', () => (h.rulesFail = true)],
  ])('shows LoadFailed and no letter when %s', async (_name, arrange) => {
    arrange()
    const html = await render()
    expect(html).toContain('Couldn’t load the hearing notice')
    expect(html).not.toContain('Dear Homeowner')
    expect(html).not.toContain('aria-label="Hearing notice"')
    expect(html).not.toContain('Jane Owner')
  })
})

describe('parts', () => {
  it('HearingNoticePrint hides its explainer and button in print', () => {
    const html = renderToStaticMarkup(
      <HearingNoticePrint view={{ association: 'A', dateLabel: 'Nov 7, 2026', ownerName: null, addressLines: ['', ''], subject: 'S', bodyHtml: '<p>Hi</p>' }} />,
    )
    expect(html).toMatch(/class="space-y-3 print:hidden"[^>]*data-testid="hearing-notice-header"/)
    expect(html).toContain('Print / Save as PDF')
  })

  it('PrintHearingNoticeLink links to the print view with a 48px target', () => {
    const html = renderToStaticMarkup(<PrintHearingNoticeLink violationId={ID} />)
    expect(html).toContain(`href="/violations/${ID}/hearing-notice"`)
    expect(html).toContain('Print the notice')
    expect(html).toContain('min-h-12')
    expect(html).toContain('print:hidden')
  })
})
