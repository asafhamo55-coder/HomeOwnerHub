// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const m = vi.hoisted(() => ({
  role: vi.fn(),
  client: vi.fn(),
  assoc: vi.fn(),
  load: vi.fn(),
  consent: vi.fn(),
  charges: vi.fn(),
  readAll: vi.fn(),
  zelle: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  unstable_rethrow: () => {},
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/link', () => ({
  default: (p: { children?: React.ReactNode; href: string; className?: string }) => (
    <a href={p.href} className={p.className}>
      {p.children}
    </a>
  ),
}))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: () => {} }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRole: m.role }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: m.client }))
vi.mock('@/lib/supabase/read-all', () => ({ readAll: m.readAll, chunk: (x: unknown[]) => [x] }))
vi.mock('@/lib/properties/roster/label-consent', () => ({ loadPaperRule: m.consent }))
vi.mock('@/lib/properties/statutory-roster/load', () => ({ readRosterAssociations: m.assoc, loadRosterInput: m.load }))
vi.mock('@/lib/dues-reminders/paper-load', () => ({ loadOpenChargesByProperty: m.charges }))
vi.mock('@/lib/pay-by-zelle', () => ({
  paySettingsSecret: () => 'secret',
  readZelleSettings: m.zelle,
  checksOf: (r: { state: string; settings?: { checks?: unknown } }) => r.settings?.checks ?? null,
}))
vi.mock('./PrintRemindersButton', () => ({ PrintRemindersButton: ({ count, disabled }: { count: number; disabled?: boolean }) => (
    <button disabled={disabled}>PRINT {count}</button>
  ) }))

const { default: Page } = await import('./page')

const org = { id: 'o1', name: 'Org', hub_type: 'hoa', plan: 'x', doors_count: null }
const board = { role: 'board', org }

function home(i: number, email: string | null, state = 'GA', name = `Owner ${i}`) {
  return {
    propertyId: `p${i}`,
    address: `${100 + i} Oak Street, Atlanta, GA 30301`,
    unitNumber: null,
    unitId: `u${i}`,
    unitIds: [`u${i}`],
    lotNumber: null,
    unitNotes: null,
    state,
    recordOwner: { name, email, phone: null },
  }
}

const charge = (id: string, balance: number, pastDue = true) => ({
  id,
  assessmentType: 'regular',
  dueDate: '2026-10-01',
  amount: balance,
  paid: 0,
  balance,
  pastDue,
  daysLate: pastDue ? 37 : 0,
})

function seed(homes: ReturnType<typeof home>[], owed: Record<string, ReturnType<typeof charge>[]>, unmappedUnits = 0) {
  m.assoc.mockResolvedValue({ rows: [], primary: { id: 'a1', state: 'GA' }, timeZone: 'America/New_York' })
  m.load.mockResolvedValue({
    states: [...new Set(homes.map((h) => h.state))],
    input: { homes, ownerships: [], residents: [], charges: [], payments: [], timeZone: 'America/New_York' },
  })
  m.charges.mockResolvedValue({ byProperty: new Map(Object.entries(owed)), unmappedUnits })
}

const CHECKS = { payableTo: 'Madison Park HOA', mailTo: 'PO Box 9, Atlanta, GA 30301', dropOff: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.role.mockResolvedValue(board)
  m.client.mockResolvedValue({})
  m.consent.mockResolvedValue({ consentApplies: () => false, granted: new Set() })
  m.readAll.mockResolvedValue([
    {
      id: 'a1',
      name: 'Madison Park',
      compliance_settings: { board_contacts: [{ label: 'Treasurer', name: 'Pat Lee', phone: '678-555-0100', email: 'pat@example.org' }] },
    },
  ])
  m.zelle.mockReturnValue({ state: 'checks_only', settings: { recipientName: null, instructions: 'Write your lot number on the check.', checks: CHECKS } })
})

afterEach(() => vi.restoreAllMocks())

const render = async () => renderToStaticMarkup(await Page())
const letterCount = (html: string) => (html.match(/class="paper-letter"/g) ?? []).length

describe('paper dues reminders page: access', () => {
  it('is board and admin only, decided before a client is made', async () => {
    for (const r of [{ role: 'resident', org }, { role: 'owner', org }, null]) {
      m.role.mockResolvedValue(r)
      await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(m.client).not.toHaveBeenCalled()
    seed([home(1, null)], { p1: [charge('c1', 250)] })
    for (const role of ['admin', 'board']) {
      m.role.mockResolvedValue({ role, org })
      expect(await render()).toContain('Owner 1')
    }
  })

  it('reads only for the signed-in organization', async () => {
    seed([home(1, null)], { p1: [charge('c1', 250)] })
    await render()
    expect(m.assoc.mock.calls[0]![1]).toBe('o1')
    expect(m.load.mock.calls[0]![1]).toBe('o1')
    expect(m.charges.mock.calls[0]![1]).toBe('o1')
    expect(m.charges.mock.calls[0]![2]).toBe('a1')
    expect(m.consent.mock.calls[0]![1]).toBe('o1')
  })
})

describe('paper dues reminders page: who gets a letter', () => {
  it('prints only owners with no email who owe money', async () => {
    seed([home(1, null), home(2, 'sam@example.org'), home(3, null), home(4, '   ')], {
      p1: [charge('c1', 250)],
      p2: [charge('c2', 300)],
      p4: [charge('c4', 75)],
    })
    const html = await render()
    expect(letterCount(html)).toBe(2)
    expect(html).toContain('Owner 1')
    expect(html).toContain('Owner 4')
    expect(html).not.toContain('Owner 2')
    expect(html).not.toContain('Owner 3')
    expect(html).toContain('2 owners get a paper reminder.')
  })

  it('judges consent home by home and fails closed on a missing account', async () => {
    seed([home(1, 'a@example.org', 'CA'), home(2, 'b@example.org', 'GA'), home(3, 'c@example.org', 'CA')], {
      p1: [charge('c1', 100)],
      p2: [charge('c2', 200)],
      p3: [charge('c3', 300)],
    })
    m.consent.mockResolvedValue({ consentApplies: (s: string | null) => s === 'CA', granted: new Set(['nobody']) })
    const html = await render()
    // CA homes have an email but no consent on record: paper. The GA home is reachable by email.
    expect(letterCount(html)).toBe(2)
    expect(html).toContain('Owner 1')
    expect(html).toContain('Owner 3')
    expect(html).not.toContain('Owner 2')
  })

  it('says so when nobody needs paper and prints nothing', async () => {
    seed([home(1, 'a@example.org')], { p1: [charge('c1', 100)] })
    const html = await render()
    expect(html).toContain('Nobody needs a paper reminder')
    expect(letterCount(html)).toBe(0)
    expect(html).not.toContain('PRINT')
  })

  it('warns about paper homes with a balance but no street address', async () => {
    seed([{ ...home(1, null), address: '' }, home(2, null)], { p1: [charge('c1', 100)], p2: [charge('c2', 100)] })
    const html = await render()
    expect(letterCount(html)).toBe(1)
    expect(html).toContain('1 home has no street address')
  })
})

describe('paper dues reminders page: content', () => {
  it('shows the amount, how to pay, the board contact, the address and the labels link', async () => {
    seed([home(1, null)], { p1: [charge('c1', 250), charge('c2', 1234.5, false)] })
    const html = await render()
    expect(html).toContain('Hi Owner 1,')
    expect(html).toContain('Here is everything currently outstanding on your account.')
    expect(html).toContain('$1,484.50')
    expect(html).toContain('$250.00 past due, oldest 37 days')
    expect(html).toContain('Regular')
    expect(html).toContain('101 Oak St')
    expect(html).toContain('Atlanta, GA 30301')
    expect(html).toContain('How to pay')
    expect(html).toContain('make it payable to Madison Park HOA')
    expect(html).toContain('Mail it to PO Box 9, Atlanta, GA 30301.')
    expect(html).toContain('Write your lot number on the check.')
    expect(html).toContain('Pat Lee')
    expect(html).toContain('678-555-0100')
    expect(html).toContain('href="/properties/roster/labels?paper=1"')
    expect(html).toContain('PRINT 1')
  })

  it('shows Zelle when the board takes it, and a plain fallback when payment is not set up', async () => {
    seed([home(1, null)], { p1: [charge('c1', 250)] })
    m.zelle.mockReturnValue({ state: 'configured', settings: { recipient: 'pay@example.org', recipientName: 'Madison Park', instructions: null } })
    let html = await render()
    expect(html).toContain('By Zelle:')
    expect(html).toContain('pay@example.org')
    m.zelle.mockReturnValue({ state: 'not_configured' })
    html = await render()
    expect(html).toContain('Please contact the board to find out how to pay.')
    expect(html).toContain('How to pay is not set up yet')
  })

  it('uses plain words, no em dashes, 13pt print body and 44px tap targets', async () => {
    seed([home(1, null)], { p1: [charge('c1', 250)] })
    const html = await render()
    expect(html).not.toContain('—')
    expect(html).toContain('font-size: 13pt')
    expect(html).toContain('min-h-11')
    expect(html).toContain('size: letter')
  })

  it('hides the screen header and instructions on paper', async () => {
    seed([home(1, null)], { p1: [charge('c1', 250)] })
    const doc = new DOMParser().parseFromString(await render(), 'text/html')
    const h1 = doc.querySelector('h1')!
    let hidden = false
    for (let n: Element | null = h1; n; n = n.parentElement) if (n.className.toString().includes('print:hidden')) hidden = true
    expect(hidden).toBe(true)
    // The letters themselves are never inside a print:hidden element.
    for (const a of Array.from(doc.querySelectorAll('article.paper-letter'))) {
      for (let n: Element | null = a; n; n = n.parentElement) expect(n.className.toString()).not.toContain('print:hidden')
    }
  })
})

describe('paper dues reminders page: one page per owner', () => {
  it('has one article per household, each breaking after itself except the last', async () => {
    seed([home(1, null), home(2, null), home(3, null)], {
      p1: [charge('c1', 250)],
      p2: [charge('c2', 300)],
      p3: [charge('c3', 350)],
    })
    const html = await render()
    expect(letterCount(html)).toBe(3)
    expect(html).toContain('.paper-letter { break-after: page;')
    expect(html).toContain('.paper-letter:last-child { break-after: auto;')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const articles = Array.from(doc.querySelectorAll('article.paper-letter'))
    expect(articles).toHaveLength(3)
    // Siblings under one parent, so :last-child is the final letter only.
    expect(new Set(articles.map((a) => a.parentElement)).size).toBe(1)
    expect(articles[2]!.nextElementSibling).toBeNull()
  })
})

describe('paper dues reminders page: gaps are never silent', () => {
  it('warns about homes that owe money but have no owner or no linked home record', async () => {
    const noOwner = { ...home(2, null), recordOwner: null }
    seed([home(1, null), noOwner], { p1: [charge('c1', 100)], p2: [charge('c2', 100)], p9: [charge('c9', 100)] }, 2)
    const html = await render()
    expect(letterCount(html)).toBe(1)
    // p2 has no owner, p9 is not on the roster, plus 2 units with no home record.
    expect(html).toContain('4 homes owe money but no letter was made')
    expect(html).toContain('Fix')
  })

  it('warns, changes the letter fallback and disables Print when there is no contact', async () => {
    seed([home(1, null)], { p1: [charge('c1', 100)] })
    m.readAll.mockResolvedValue([{ id: 'a1', name: 'Madison Park', compliance_settings: {} }])
    let html = await render()
    expect(html).toContain('No board contact is set up')
    expect(html).toContain('Please ask the board for contact details.')
    expect(html).not.toContain('<button disabled')
    m.zelle.mockReturnValue({ state: 'not_configured' })
    html = await render()
    expect(html).toContain('<button disabled')
    expect(html).toContain('Printing is turned off')
  })

  it('uses one association and says which one when the org has several', async () => {
    seed([home(1, null)], { p1: [charge('c1', 100)] })
    m.readAll.mockResolvedValue([
      { id: 'a0', name: 'Other Association', compliance_settings: { board_contacts: [{ label: 'X', name: 'Wrong Person', phone: '678-555-9999', email: '' }] } },
      { id: 'a1', name: 'Madison Park', compliance_settings: { board_contacts: [{ label: 'Treasurer', name: 'Pat Lee', phone: '678-555-0100', email: '' }] } },
    ])
    const html = await render()
    expect(html).toContain('These letters are for Madison Park.')
    expect(html).toContain('Pat Lee')
    expect(html).not.toContain('Wrong Person')
    expect(m.zelle.mock.calls[0]![0]).toBe('a1')
  })

  it('fails closed when the chosen association is missing from the settings read', async () => {
    seed([home(1, null)], { p1: [charge('c1', 100)] })
    m.readAll.mockResolvedValue([{ id: 'zzz', name: 'Other', compliance_settings: {} }])
    expect(letterCount(await render())).toBe(0)
  })

  it('tells the board when saved payment details do not verify', async () => {
    seed([home(1, null)], { p1: [charge('c1', 100)] })
    m.zelle.mockReturnValue({ state: 'unverified' })
    const html = await render()
    expect(html).toContain('Your saved payment details could not be verified. Please save them again under Settings, Payments.')
    expect(html).toContain('Please contact the board to find out how to pay.')
  })

  it('explains the consent rule on the page', async () => {
    seed([home(1, null)], { p1: [charge('c1', 100)] })
    expect(await render()).toContain(
      'Owners in states that require consent to email notices are included here even if they also received an email reminder.',
    )
  })

  it('greets by name, or with Hello when no name is on file', async () => {
    seed([home(1, null), { ...home(2, null), recordOwner: { name: null, email: null, phone: null } }], {
      p1: [charge('c1', 100)],
      p2: [charge('c2', 100)],
    })
    const html = await render()
    expect(html).toContain('Hi Owner 1,')
    expect(html).toContain('Hello,')
    expect(html).not.toContain('Hi Current Resident')
  })
})

describe('paper dues reminders page: fail closed', () => {
  const failures: Array<[string, () => void]> = [
    ['the association read fails', () => m.assoc.mockRejectedValue(new Error('boom Pat Lee'))],
    ['the roster read fails', () => m.load.mockRejectedValue(new Error('boom'))],
    ['the consent read is unavailable', () => m.consent.mockResolvedValue(null)],
    ['the consent read throws', () => m.consent.mockRejectedValue(new Error('boom'))],
    ['the charges read fails', () => m.charges.mockRejectedValue(new Error('boom'))],
    ['the payment details read fails', () => m.readAll.mockRejectedValue(new Error('boom'))],
  ]
  for (const [name, fail] of failures) {
    it(`shows a load failure and prints nothing when ${name}`, async () => {
      seed([home(1, null)], { p1: [charge('c1', 250)] })
      fail()
      const html = await render()
      expect(letterCount(html)).toBe(0)
      expect(html).not.toContain('PRINT')
      expect(html).not.toContain('Owner 1')
      expect(html).not.toContain('Nobody needs a paper reminder')
      expect(html).toContain('Try again')
      expect(html).toContain('Couldn’t load')
    })
  }

  it('does not log names, addresses or amounts on success', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
    seed([home(1, null, 'GA', 'Pat Lee')], { p1: [charge('c1', 250)] })
    await render()
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toMatch(/Pat Lee|Oak St|250/)
  })
})
