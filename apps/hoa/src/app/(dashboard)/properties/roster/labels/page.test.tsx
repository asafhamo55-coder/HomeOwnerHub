// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const m = vi.hoisted(() => ({ role: vi.fn(), client: vi.fn(), assoc: vi.fn(), load: vi.fn(), consent: vi.fn(), primary: vi.fn() }))

vi.mock('next/navigation', () => ({
  unstable_rethrow: () => {},
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/link', () => ({
  default: (p: { children?: React.ReactNode; href: string }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('@/lib/auth', () => ({ getCurrentUserRole: m.role }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: m.client }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: m.primary }))
vi.mock('@/lib/properties/roster/label-consent', () => ({ loadNoConsentEmails: m.consent }))
vi.mock('@/lib/properties/statutory-roster/load', () => ({
  readRosterAssociations: m.assoc,
  loadRosterInput: m.load,
}))
vi.mock('./PrintLabelsButton', () => ({ PrintLabelsButton: () => <button>PRINT</button> }))

const { default: Page } = await import('./page')

const org = { id: 'o1', name: 'Org', hub_type: 'hoa', plan: 'x', doors_count: null }
const none = Promise.resolve({})

function home(i: number, email: string | null, address = `${100 + i} Oak Street, Atlanta, GA 30301`) {
  return {
    propertyId: `p${i}`,
    address,
    unitNumber: null,
    unitId: `u${i}`,
    unitIds: [`u${i}`],
    lotNumber: null,
    unitNotes: null,
    state: 'GA',
    recordOwner: { name: `Owner ${i}`, email, phone: null },
  }
}

function seed(homes: ReturnType<typeof home>[]) {
  m.assoc.mockResolvedValue({ rows: [], primary: { state: 'GA' }, timeZone: 'America/New_York' })
  m.load.mockResolvedValue({ input: { homes, ownerships: [], residents: [], charges: [], payments: [], timeZone: 'America/New_York' } })
}

/** True when `needle` sits inside an element whose class list has print:hidden. */
function insidePrintHidden(html: string, needle: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // The tightest element holding the text, so a page-wide wrapper does not count.
  const el = Array.from(doc.querySelectorAll('h1,p,div'))
    .filter((e) => e.textContent?.includes(needle))
    .sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0))[0]
  for (let n: Element | null = el ?? null; n; n = n.parentElement) if (n.className.toString().includes('print:hidden')) return true
  return false
}

beforeEach(() => {
  vi.clearAllMocks()
  m.client.mockResolvedValue({})
  m.primary.mockResolvedValue({ id: 'a1' })
  m.consent.mockResolvedValue(new Set())
})

describe('mailing labels page', () => {
  it('is board and admin only, decided before a client is made', async () => {
    for (const r of [{ role: 'resident', org }, { role: 'owner', org }, null]) {
      m.role.mockResolvedValue(r)
      await expect(Page({ searchParams: none })).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(m.client).not.toHaveBeenCalled()
    seed([home(1, null)])
    for (const role of ['admin', 'board']) {
      m.role.mockResolvedValue({ role, org })
      expect(renderToStaticMarkup(await Page({ searchParams: none }))).toContain('Owner 1')
    }
  })

  it('hides the title and description on paper so nothing sits above sheet 1', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    seed([home(1, null)])
    const html = renderToStaticMarkup(await Page({ searchParams: none }))
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const h1 = doc.querySelector('h1')!
    expect(h1.textContent).toBe('Mailing labels')
    expect(insidePrintHidden(html, 'Mailing labels')).toBe(true)
    let hidden = false
    for (let n: Element | null = h1; n; n = n.parentElement) if (n.className.toString().includes('print:hidden')) hidden = true
    expect(hidden).toBe(true)
    expect(insidePrintHidden(html, 'standard 30-up address labels')).toBe(true)
    expect(html).toContain('print:m-0')
    expect(html).toContain('print:p-0')
  })

  it('shows the three numbered print steps, without em dashes', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    seed([home(1, null)])
    const html = renderToStaticMarkup(await Page({ searchParams: none }))
    expect(html).toContain('<ol')
    expect(html).toContain('Print one test page on plain paper and hold it against a label sheet to check it lines up.')
    expect(html).toContain('In the print window set Scale to 100. Do not choose Fit to page or Shrink to fit.')
    expect(html).toContain('Turn off Headers and footers.')
    expect(html).not.toContain('—')
  })

  it('prints 30-up sheets with the exact label geometry', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    seed(Array.from({ length: 31 }, (_, i) => home(i + 1, null)))
    const html = renderToStaticMarkup(await Page({ searchParams: none }))
    expect(html).toContain('31 labels, 2 sheets')
    expect((html.match(/class="label-sheet"/g) ?? []).length).toBe(2)
    expect(html).toContain('size: letter; margin: 0;')
    expect(html).toContain('repeat(3, 2.625in)')
    expect(html).toContain('grid-auto-rows: 1in')
    expect(html).toContain('height: 10.99in; overflow: hidden')
    expect(html).toContain('-webkit-print-color-adjust: exact')
    expect(html).toContain('overflow-wrap: anywhere')
  })

  it('filters to owners who get notices on paper when asked', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    seed([home(1, null), home(2, 'two@example.test'), home(3, '   ')])
    const all = renderToStaticMarkup(await Page({ searchParams: none }))
    expect(all).toContain('3 labels')
    const only = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ paper: '1' }) }))
    expect(only).toContain('2 labels')
    expect(only).toContain('Owner 1')
    expect(only).toContain('Owner 3')
    expect(only).not.toContain('Owner 2')
    expect(only).toContain('every owner has no email on file')
  })

  it('treats an owner who has not agreed to electronic notices as paper', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    seed([home(1, 'one@example.test'), home(2, 'two@example.test')])
    m.consent.mockResolvedValue(new Set(['one@example.test']))
    const only = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ paper: '1' }) }))
    expect(only).toContain('Owner 1')
    expect(only).not.toContain('Owner 2')
  })

  it('merges duplicates and says so, and warns about shortened labels', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    const long = `${'1234 Extraordinarily Long Boulevard Name '.repeat(2).trim()}, Atlanta, GA 30309`
    seed([home(1, null), { ...home(1, null), propertyId: 'p1b' }, home(2, null, long)])
    const html = renderToStaticMarkup(await Page({ searchParams: none }))
    expect(html).toContain('2 labels, 1 sheet, 1 duplicate merged')
    expect(html).toContain('1 label was shortened to fit')
  })

  it('says so, with a retry that keeps the filter, when the read fails', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    m.assoc.mockResolvedValue({ rows: [], primary: undefined, timeZone: 'America/New_York' })
    m.load.mockRejectedValue(new Error('boom'))
    const plain = renderToStaticMarkup(await Page({ searchParams: none }))
    expect(plain).not.toContain('label-sheet')
    expect(plain).toContain('Couldn')
    expect(plain).toContain('the owner list')
    expect(plain).toContain('href="/properties/roster/labels"')
    const filtered = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ paper: '1' }) }))
    expect(filtered).toContain('href="/properties/roster/labels?paper=1"')
  })

  it('fails closed when consent cannot be read', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    seed([home(1, null)])
    m.consent.mockResolvedValue(null)
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ paper: '1' }) }))
    expect(html).not.toContain('label-sheet')
    expect(html).toContain('href="/properties/roster/labels?paper=1"')
  })
})
