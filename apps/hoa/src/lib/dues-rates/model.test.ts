import { describe, expect, it } from 'vitest'
import {
  annualCents,
  billingPrefill,
  changePct,
  dollarsToCents,
  perChargeCents,
  pctPhrase,
  rateChange,
  rateFromRow,
  rateInEffect,
  rateOverride,
  suggestFromBudget,
  upcomingRate,
  validateRate,
  type DuesRate,
} from './model'
import { buildRateNotice, readRateNoticeDraft, writeRateNoticeDraft } from './notice'

const rate = (id: string, effectiveFrom: string, amountCents: number, frequency: DuesRate['frequency'] = 'monthly'): DuesRate => ({
  id,
  associationId: 'a1',
  effectiveFrom,
  basis: 'per_home',
  amountCents,
  frequency,
  budgetId: null,
  notes: null,
})

const r2026 = rate('r1', '2026-01-01', 25_000)
const r2027 = rate('r2', '2027-01-01', 27_500)
const rates = [r2027, r2026]

describe('the schedule', () => {
  it('rate in effect: the latest that started on or before the day', () => {
    expect(rateInEffect(rates, '2025-12-31')).toBeNull()
    expect(rateInEffect(rates, '2026-01-01')).toBe(r2026)
    expect(rateInEffect(rates, '2026-12-31')).toBe(r2026)
    expect(rateInEffect(rates, '2027-01-01')).toBe(r2027)
  })

  it('upcoming: the next one after today', () => {
    expect(upcomingRate(rates, '2026-10-21')).toBe(r2027)
    expect(upcomingRate(rates, '2027-01-01')).toBeNull()
  })

  it('change: yearly amounts, so frequencies compare; first rate has none', () => {
    const c = rateChange(rates, r2027)
    expect(c.from).toBe(r2026)
    expect(c.pct).toBe(10)
    expect(c.deltaAnnualCents).toBe(30_000)
    expect(rateChange(rates, r2026)).toMatchObject({ from: null, pct: null, deltaAnnualCents: null })
    const yearly = rate('r3', '2028-01-01', 330_000, 'annual')
    expect(rateChange([...rates, yearly], yearly).pct).toBe(0)
    expect(changePct(300_000, 330_000)).toBe(10)
    expect(changePct(0, 1)).toBeNull()
    expect(pctPhrase(8.5)).toBe('up 8.5%')
    expect(pctPhrase(-2)).toBe('down 2%')
    expect(pctPhrase(0)).toBe('no change')
  })

  it('rows: bad rows are dropped, unknown basis reads as per home', () => {
    expect(rateFromRow({ id: 'x', effective_from: '2026-02-30', amount_cents: 1, frequency: 'monthly' })).toBeNull()
    expect(rateFromRow({ id: 'x', effective_from: '2026-02-01', amount_cents: 0, frequency: 'monthly' })).toBeNull()
    expect(rateFromRow({ id: 'x', effective_from: '2026-02-01', amount_cents: '1500', frequency: 'weekly' })).toBeNull()
    expect(rateFromRow({ id: 'x', effective_from: '2026-02-01', amount_cents: '1500', frequency: 'quarterly', basis: '?' })).toMatchObject({
      amountCents: 1500,
      basis: 'per_home',
      frequency: 'quarterly',
    })
  })
})

describe('billing pre-fill and the audited override', () => {
  it('per charge: monthly, annual and once', () => {
    const q = rate('q', '2026-01-01', 75_000, 'quarterly')
    expect(annualCents(q)).toBe(300_000)
    expect(perChargeCents(q, 'monthly')).toEqual({ cents: 25_000, exact: true })
    expect(perChargeCents(q, 'annual')).toEqual({ cents: 300_000, exact: true })
    expect(perChargeCents(q, 'one_time')).toEqual({ cents: 75_000, exact: true })
    expect(perChargeCents(rate('y', '2026-01-01', 100_000, 'annual'), 'monthly')).toEqual({ cents: 8_333, exact: false })
  })

  it('pre-fill uses the rate in effect on the billing day, and says where it came from', () => {
    expect(billingPrefill(rates, '2025-06-01', 'monthly')).toBeNull()
    const p = billingPrefill(rates, '2027-01-15', 'monthly')!
    expect(p).toMatchObject({ rateId: 'r2', cents: 27_500, exact: true })
    expect(p.hint).toContain('$275.00 a month')
    expect(billingPrefill(rates, '2026-03-01', 'annual')!.hint).toContain('= $3,000.00 a year')
  })

  it('override: only when the billed amount differs from the rate', () => {
    expect(rateOverride(rates, '2026-05-01', 'monthly', 25_000)).toBeNull()
    expect(rateOverride(rates, '2026-05-01', 'monthly', 26_000)).toEqual({ rateId: 'r1', expectedCents: 25_000, billedCents: 26_000 })
    expect(rateOverride([], '2026-05-01', 'monthly', 26_000)).toBeNull()
  })
})

describe('budget → rate', () => {
  it('assessment income ÷ homes, monthly, from the budget year', () => {
    const s = suggestFromBudget({ annualCents: 330_000, homes: 40, assessmentIncomeCents: 13_200_000 }, 'monthly', '2027-01-01')!
    expect(s).toMatchObject({ amountCents: 27_500, frequency: 'monthly', effectiveFrom: '2027-01-01' })
    expect(s.explanation).toContain('$132,000.00 ÷ 40 homes')
    expect(suggestFromBudget({ annualCents: 100_000, homes: 3 }, 'monthly', null)!.explanation).toContain('rounded')
    expect(suggestFromBudget({ annualCents: 0, homes: 3 }, 'monthly', null)).toBeNull()
  })
})

describe('form validation', () => {
  it('accepts money and a real day', () => {
    expect(validateRate({ effectiveFrom: '2027-01-01', amount: '$1,250.5', frequency: 'quarterly', notes: '  ' })).toEqual({
      ok: true,
      value: { effectiveFrom: '2027-01-01', amountCents: 125_050, frequency: 'quarterly', notes: null, budgetId: null },
    })
    expect(dollarsToCents('12.345')).toBeNaN()
  })

  it('refuses a bad day, amount, frequency and budget id', () => {
    const r = validateRate({ effectiveFrom: '2027-02-30', amount: '0', frequency: 'weekly', budgetId: 'nope' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['amount', 'budgetId', 'effectiveFrom', 'frequency'])
    const big = validateRate({ effectiveFrom: '2027-01-01', amount: '100000.01', frequency: 'monthly' })
    expect(big.ok).toBe(false)
  })
})

describe('owner notice draft', () => {
  it('states the facts, leaves the reason blank, escapes the name, quotes no statute', () => {
    const d = buildRateNotice({ associationName: 'Oak & <Pine>', change: rateChange(rates, r2027) })
    expect(d.subject).toBe('Dues increase starting Jan 1, 2027')
    expect(d.bodyHtml).toContain('<strong>$275.00 a month</strong>')
    expect(d.bodyHtml).toContain('up from $250.00 a month (up 10% a year)')
    expect(d.bodyHtml).toContain('[Explain the reason')
    expect(d.bodyHtml).toContain('Oak &amp; &lt;Pine&gt;')
    expect(d.bodyHtml).not.toMatch(/§|O\.C\.G\.A|Stat\./)
  })

  it('hand-off round-trips, and a blocked storage fails closed', () => {
    const mem = new Map<string, string>()
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    const d = buildRateNotice({ associationName: null, change: rateChange(rates, r2026) })
    expect(writeRateNoticeDraft(store, d)).toBe(true)
    expect(readRateNoticeDraft(store)).toEqual(d)
    const blocked = () => {
      throw new Error('blocked')
    }
    const throwing = { getItem: blocked, setItem: blocked }
    expect(writeRateNoticeDraft(throwing, d)).toBe(false)
    expect(readRateNoticeDraft(throwing)).toBeNull()
    expect(readRateNoticeDraft(null)).toBeNull()
  })
})
