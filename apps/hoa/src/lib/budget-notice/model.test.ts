import { describe, expect, it } from 'vitest'
import {
  blanksLeft,
  buildNotice,
  caWindow,
  computeFigures,
  escapeHtml,
  noticeHtml,
  noticeProblem,
  parseSignedMoneyCents,
  perHomeOf,
  readSchedule,
  surplusLabel,
  usdCents,
  valueOf,
  type BudgetNoticeInput,
  type RegularCharge,
} from './model'
import { CA_ITEMS_NOT_GENERATED, CA_PARTIAL_LABEL } from './law'

/**
 * Fixture budget: 40 homes, FY 2027, operating fund.
 *   Income  4000 Assessment income   48,000.00
 *           4100 Late fees              300.00
 *           4200 Interest               125.50
 *   Expense 5100 Landscaping         18,000.00
 *           5200 Insurance            9,250.25
 *           5300 Pool service         4,800.00
 *           6000 Reserve contribution 12,000.00
 * Totals: income 48,425.50; expenses 44,050.25; net 4,375.25.
 * Per home: 48,000 / 40 = 1,200.00.
 */
const LINES: BudgetNoticeInput['lines'] = [
  { accountNumber: '5200', accountName: 'Insurance', accountType: 'expense', amount: 9250.25 },
  { accountNumber: '4000', accountName: 'Assessment income', accountType: 'income', amount: 48000 },
  { accountNumber: '4100', accountName: 'Late fees', accountType: 'income', amount: 300 },
  { accountNumber: '4200', accountName: 'Interest', accountType: 'income', amount: 125.5 },
  { accountNumber: '5100', accountName: 'Landscaping', accountType: 'expense', amount: 18000 },
  { accountNumber: '5300', accountName: 'Pool service', accountType: 'expense', amount: 4800 },
  { accountNumber: '6000', accountName: 'Reserve contribution', accountType: 'expense', amount: 12000 },
]

function input(over: Partial<BudgetNoticeInput> = {}): BudgetNoticeInput {
  return {
    budgetId: '11111111-1111-4111-8111-111111111111',
    status: 'approved',
    associationName: 'Creek Valley HOA',
    state: 'FL',
    fundName: 'Operating',
    period: { start_date: '2027-01-01', end_date: '2027-12-31' },
    approvedDay: '2026-11-12',
    lines: LINES,
    billableUnits: 40,
    regularCharges: [],
    ...over,
  }
}

/** Every one of `homes` billed `count` installments of `amount` from Jan 1, quarterly. */
function schedule(homes: number, count: number, amount: number): RegularCharge[] {
  const out: RegularCharge[] = []
  for (let h = 0; h < homes; h++) {
    for (let i = 0; i < count; i++) {
      out.push({ unitId: `u${h}`, amount, dueDate: `2027-${String(1 + i * 3).padStart(2, '0')}-01` })
    }
  }
  return out
}

describe('figures', () => {
  it('groups by income and expense, sorted by account, with totals in cents', () => {
    const f = computeFigures(input())
    expect(f.income.map((l) => l.accountNumber)).toEqual(['4000', '4100', '4200'])
    expect(f.expenses.map((l) => l.accountNumber)).toEqual(['5100', '5200', '5300', '6000'])
    expect(f.incomeTotalCents).toBe(4_842_550)
    expect(f.expenseTotalCents).toBe(4_405_025)
    expect(f.netCents).toBe(437_525)
    expect(f.otherLineCount).toBe(0)
    expect(f.fullYear).toBe(true)
  })

  it('leaves balance-sheet lines out of the totals and counts them', () => {
    const f = computeFigures(input({ lines: [...LINES, { accountNumber: '1010', accountName: 'Cash', accountType: 'asset', amount: 999 }] }))
    expect(f.otherLineCount).toBe(1)
    expect(f.incomeTotalCents).toBe(4_842_550)
  })

  it('sums float dollars exactly (0.1 + 0.2 style)', () => {
    const f = computeFigures(
      input({
        lines: [
          { accountNumber: '5100', accountName: 'A', accountType: 'expense', amount: 0.1 },
          { accountNumber: '5200', accountName: 'B', accountType: 'expense', amount: 0.2 },
        ],
      }),
    )
    expect(f.expenseTotalCents).toBe(30)
  })

  it('a period that is not a full year is not "per year"', () => {
    const f = computeFigures(input({ period: { start_date: '2027-01-01', end_date: '2027-06-30' } }))
    expect(f.fullYear).toBe(false)
    const n = buildNotice(input({ period: { start_date: '2027-01-01', end_date: '2027-06-30' } }), '2026-11-20')
    expect(n.fields.find((x) => x.key === 'perHome')!.value).toBe('$1,200.00 for the budget period')
  })
})

describe('per-home regular assessment', () => {
  it('from units: assessment income shared equally', () => {
    expect(perHomeOf(input())).toEqual({ kind: 'units', annualCents: 120_000, homes: 40, assessmentIncomeCents: 4_800_000, remainderCents: 0 })
  })

  it('from units: rounds down and reports the remainder', () => {
    const p = perHomeOf(input({ billableUnits: 7 }))
    expect(p).toMatchObject({ kind: 'units', annualCents: 685_714, remainderCents: 2 })
  })

  it('from the schedule when every home is billed the same, with installments', () => {
    const p = perHomeOf(input({ regularCharges: schedule(40, 4, 300) }))
    expect(p).toEqual({ kind: 'schedule', annualCents: 120_000, homes: 40, installments: { count: 4, amountCents: 30_000, firstDue: '2027-01-01' } })
    const n = buildNotice(input({ regularCharges: schedule(40, 4, 300) }), '2026-11-20')
    expect(n.fields.find((x) => x.key === 'payment')!.value).toBe('4 installments of $300.00, the first due Jan 1, 2027')
  })

  it('from the schedule with no budgeted assessment income line', () => {
    const lines = LINES.filter((l) => l.accountNumber !== '4000')
    expect(perHomeOf(input({ lines, regularCharges: schedule(40, 1, 1200) }))).toMatchObject({ kind: 'schedule', annualCents: 120_000 })
  })

  it('BLANK when homes are billed different totals', () => {
    const charges = [...schedule(39, 4, 300), ...schedule(1, 4, 450).map((c) => ({ ...c, unitId: 'big' }))]
    const p = perHomeOf(input({ regularCharges: charges }))
    expect(p.kind).toBe('unknown')
    expect(p.kind === 'unknown' && p.reason).toContain('$1,200.00 to $1,800.00')
  })

  it('BLANK when only some homes are billed so far', () => {
    const p = perHomeOf(input({ regularCharges: schedule(30, 4, 300) }))
    expect(p.kind === 'unknown' && p.reason).toContain('Only 30 of 40 homes')
  })

  it('BLANK when the billed amount and the budget disagree', () => {
    const p = perHomeOf(input({ regularCharges: schedule(40, 4, 250) }))
    expect(p.kind === 'unknown' && p.reason).toContain('don’t match')
  })

  it('BLANK when neither source exists', () => {
    const lines = LINES.filter((l) => l.accountNumber !== '4000')
    expect(perHomeOf(input({ lines })).kind).toBe('unknown')
    expect(perHomeOf(input({ billableUnits: null })).kind).toBe('unknown')
    expect(perHomeOf(input({ billableUnits: 0 })).kind).toBe('unknown')
  })

  it('a uniform total with uneven installments gives no installment line', () => {
    const charges: RegularCharge[] = []
    for (let h = 0; h < 40; h++) {
      charges.push({ unitId: `u${h}`, amount: 1000, dueDate: '2027-01-01' }, { unitId: `u${h}`, amount: 200, dueDate: '2027-07-01' })
    }
    expect(readSchedule(charges)).toMatchObject({ annualCents: 120_000, installments: null })
    const n = buildNotice(input({ regularCharges: charges }), '2026-11-20')
    expect(n.fields.find((x) => x.key === 'perHome')!.value).toBe('$1,200.00 per year')
    expect(n.fields.find((x) => x.key === 'payment')!.value).toBeNull()
  })
})

describe('BLANKs', () => {
  it('Florida: reserves, surplus/deficit and amenities are always BLANKs', () => {
    const n = buildNotice(input(), '2026-11-20')
    const blank = n.fields.filter((f) => f.value === null).map((f) => f.key)
    expect(blank).toEqual(['payment', 'reserves', 'surplus', 'amenities'])
  })

  it('California: the § 5300(b) board statements and reserves are BLANKs', () => {
    const n = buildNotice(input({ state: 'CA' }), '2026-11-20')
    const blank = n.fields.filter((f) => f.value === null).map((f) => f.key)
    expect(blank).toEqual(['payment', 'reserves', 'deferral', 'specials', 'mechanisms', 'loans'])
  })

  it('the reserves hint no longer claims the app has no reserve module (funds exist since BL-120)', () => {
    for (const state of ['FL', 'CA', 'TX']) {
      const hint = buildNotice(input({ state }), '2026-11-20').fields.find((f) => f.key === 'reserves')!.hint ?? ''
      expect(hint).not.toContain('no reserve module')
      expect(hint).toContain('doesn’t fill reserves in from your books')
    }
  })

  it('other states: only reserves (and what is unknown)', () => {
    const n = buildNotice(input({ state: 'TX', approvedDay: null, billableUnits: null }), '2026-11-20')
    expect(n.fields.filter((f) => f.value === null).map((f) => f.key)).toEqual(['adoptedOn', 'perHome', 'payment', 'reserves'])
  })

  it('blanksLeft empties only when each is filled; a bad amount stays a BLANK', () => {
    const n = buildNotice(input(), '2026-11-20')
    const values: Record<string, string> = { payment: '12 monthly installments of $100', reserves: 'None', amenities: 'None', surplus: 'abc' }
    expect(blanksLeft(n.fields, values)).toEqual(['Estimated surplus or deficit at the end of the current year'])
    values.surplus = '(1,500.50)'
    expect(blanksLeft(n.fields, values)).toEqual([])
    expect(valueOf(n.fields.find((f) => f.key === 'surplus')!, values)).toBe('Deficit of $1,500.50')
  })

  it('signed amounts', () => {
    expect(parseSignedMoneyCents('-1,500')).toBe(-150_000)
    expect(parseSignedMoneyCents('−$20.5')).toBe(-2_050)
    expect(parseSignedMoneyCents('2500')).toBe(250_000)
    expect(parseSignedMoneyCents('+3')).toBe(300)
    expect(parseSignedMoneyCents('1.234')).toBeNull()
    expect(parseSignedMoneyCents('')).toBeNull()
    expect(surplusLabel(0)).toBe('Break-even ($0.00)')
    expect(surplusLabel(12_345)).toBe('Surplus of $123.45')
    expect(usdCents(-5)).toBe('-$0.05')
  })
})

describe('the notice HTML', () => {
  const filledFl = { payment: '4 quarterly installments of $300', reserves: 'Roof reserve: $12,000', surplus: '2500', amenities: 'Pool service, $4,800' }

  it('Florida: categories, totals, per-home and the § 720.303(6) lines', () => {
    const i = input()
    const n = buildNotice(i, '2026-11-20')
    const html = noticeHtml(n, i, filledFl)
    expect(html).toContain('Annual Budget — FY 2027')
    expect(html).toContain('Adopted on Nov 12, 2026')
    expect(html).toContain('$1,200.00 per year')
    expect(html).toContain('shared equally across 40 homes')
    expect(html).toContain('<td>Landscaping</td><td style="text-align:right">$18,000.00</td>')
    expect(html).toContain('<strong>$48,425.50</strong>')
    expect(html).toContain('<strong>$44,050.25</strong>')
    expect(html).toContain('<strong>$4,375.25</strong>')
    expect(html).toContain('Surplus of $2,500.00')
    expect(html).toContain('available to any member on request at no charge')
    expect(html).not.toContain('[[BLANK')
    expect(html).not.toContain(CA_PARTIAL_LABEL)
  })

  it('unfilled BLANKs render as markers', () => {
    const i = input()
    const html = noticeHtml(buildNotice(i, '2026-11-20'), i, {})
    expect(html).toContain('[[BLANK: Reserve accounts and contributions in this budget]]')
    expect(html).toContain('[[BLANK: Estimated surplus or deficit at the end of the current year]]')
  })

  it('California is labelled Partial and lists every item not generated', () => {
    const i = input({ state: 'CA' })
    const html = noticeHtml(buildNotice(i, '2026-08-01'), i, {})
    expect(html).toContain('Annual Budget Report — FY 2027')
    expect(html).toContain(CA_PARTIAL_LABEL)
    for (const item of CA_ITEMS_NOT_GENERATED) expect(html).toContain(escapeHtml(item.cite))
    expect(html).not.toMatch(/fully compl|complies with|in compliance/i)
  })

  it('other states make no statutory claim', () => {
    const i = input({ state: 'TX' })
    const html = noticeHtml(buildNotice(i, '2026-11-20'), i, {})
    expect(html).not.toMatch(/§|Fla\. Stat|Civ\. Code/)
  })

  it('board text is escaped and cannot become a merge variable', () => {
    const i = input()
    const html = noticeHtml(buildNotice(i, '2026-11-20'), i, { ...filledFl, amenities: '<script>x</script> {{ recipient_name }}' })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('{{')
    expect(html).toContain('&lt;script&gt;')
  })

  it('subject names the association and period', () => {
    expect(buildNotice(input(), '2026-11-20').subject).toBe('Creek Valley HOA: annual budget for FY 2027')
  })
})

describe('California § 5300(a) window', () => {
  it('30 to 90 days before the fiscal year ends', () => {
    // FY 2027 follows the fiscal year ending 2026-12-31.
    expect(caWindow({ start_date: '2027-01-01' }, '2026-11-01')).toEqual({ fiscalYearEnd: '2026-12-31', earliest: '2026-10-02', latest: '2026-12-01', status: 'within' })
    expect(caWindow({ start_date: '2027-01-01' }, '2026-10-01')!.status).toBe('early')
    expect(caWindow({ start_date: '2027-01-01' }, '2026-12-02')!.status).toBe('late')
    expect(caWindow(null, '2026-11-01')).toBeNull()
  })
})

describe('only adopted budgets', () => {
  it('a draft or empty budget is refused', () => {
    expect(noticeProblem({ status: 'draft', lines: LINES })).toMatch(/adopted/)
    expect(noticeProblem({ status: 'archived', lines: LINES })).toMatch(/adopted/)
    expect(noticeProblem({ status: 'approved', lines: [] })).toMatch(/no lines/)
    expect(noticeProblem({ status: 'approved', lines: LINES })).toBeNull()
  })
})
