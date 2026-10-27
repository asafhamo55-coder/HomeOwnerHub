import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GA_17A1_SPECIFIC, GA_17A8_ORDER } from '@/lib/compliance/statute-drift'
import {
  AMBIGUITY_TEXT,
  GA_PAYMENT_ORDER_CITATION,
  GA_PAYMENT_ORDER_EFFECTIVE_ON,
  GA_PAYMENT_ORDER_TIERS,
  allocatePayment,
  allocationMode,
  ambiguitiesIn,
  gaPaymentOrderApplies,
  orderForPayLines,
  rankCharge,
  type OpenCharge,
} from './ga-payment-order'

const REPO_ROOT = resolve(__dirname, '../../../../..')
const squash = (s: string) => s.replace(/\s+/g, ' ')
const fixture = squash(readFileSync(resolve(REPO_ROOT, 'scripts/fixtures/state-law/ga-sb406-2026-2027-text.txt'), 'utf8'))
const section8 = fixture.slice(fixture.indexOf(' 43-17A-8. '), fixture.indexOf(' 43-17A-9. '))
// The module's own comment, with the " * " line prefixes removed.
const source = squash(readFileSync(resolve(__dirname, 'ga-payment-order.ts'), 'utf8').replace(/\n \* ?/g, ' '))

const FULL = [
  '(1) Regular assessments or dues until current;',
  '(2) Special assessments until current;',
  '(3) Specific assessments until current; and',
  '(4) Other fees and fines.',
]

describe('quotes are word for word', () => {
  it('the section really is § 43-17A-8 (guards the slice)', () => {
    expect(section8.length).toBeGreaterThan(200)
    expect(section8.startsWith(' 43-17A-8. (a) All funds remitted')).toBe(true)
  })
  it('each rank is the statute’s paragraph (1) to (4), in the fixture, the code comment and the citation', () => {
    FULL.forEach((p) => {
      expect(section8, p).toContain(p)
      expect(source, p).toContain(p)
    })
    expect(section8.indexOf(FULL[0]!)).toBeLessThan(section8.indexOf(FULL[1]!))
    expect(section8.indexOf(FULL[1]!)).toBeLessThan(section8.indexOf(FULL[2]!))
    expect(section8.indexOf(FULL[2]!)).toBeLessThan(section8.indexOf(FULL[3]!))
  })
  it('the tier constants are exactly those paragraphs, in order', () => {
    expect(GA_PAYMENT_ORDER_TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4])
    expect(GA_PAYMENT_ORDER_TIERS.map((t) => t.quote)).toEqual([
      'Regular assessments or dues until current',
      'Special assessments until current',
      'Specific assessments until current',
      'Other fees and fines',
    ])
    GA_PAYMENT_ORDER_TIERS.forEach((t, i) => {
      expect(FULL[i]).toContain(`(${t.tier}) ${t.quote}`)
      expect(GA_17A8_ORDER.quote).toContain(`(${t.tier}) ${t.quote}`)
    })
    expect(GA_PAYMENT_ORDER_CITATION).toBe(GA_17A8_ORDER)
  })
  it('the citation is paragraph (a) of the fixture', () => {
    expect(section8).toContain(`(a) ${GA_17A8_ORDER.quote}`)
  })
  it('the lead sentence in the comment is in the fixture', () => {
    const lead =
      "All funds remitted by an owner to an owners' association shall be applied by such owners' association to the following expenses by ranking of highest to lowest priority as follows:"
    expect(source).toContain(lead)
    expect(section8).toContain(lead)
  })
  it('the § 43-17A-1(10) fragments in the comment are in the statute quote and the fixture', () => {
    const frags = [
      "an assessment imposed on an owner for: (A) Costs incurred by the owners' association to repair or remediate damage caused by such owner to the owners' association",
      "(B) Fees or fines for nonpayment, insufficient payment, or untimely payment of any assessment or for violation of a covenant of the owners' association.",
    ]
    for (const f of frags) {
      expect(source).toContain(f)
      expect(GA_17A1_SPECIFIC.quote).toContain(f)
      expect(fixture).toContain(f)
    }
  })
  it('the effective date is SB 406 § 9(a)', () => {
    expect(fixture).toContain('this Act shall become effective on January 1, 2027')
    expect(GA_PAYMENT_ORDER_EFFECTIVE_ON).toBe('2027-01-01')
  })
})

describe('rankCharge', () => {
  it.each([
    ['regular', 1, null],
    ['special', 2, null],
    ['late_fee', 3, null],
    ['fine', 3, null],
    ['interest', 4, 'interest'],
    ['lien_filing', 4, 'collection_cost'],
    ['collection_legal', 4, 'collection_cost'],
    ['collection_letter', 4, 'collection_cost'],
    ['collection_processing', 4, 'collection_cost'],
    ['something_new', 4, 'unknown_type'],
  ])('%s -> tier %i', (type, tier, ambiguity) => {
    expect(rankCharge({ type })).toEqual({ tier, ambiguity })
  })
  it('a plan installment is last and flagged, even though stored as special', () => {
    expect(rankCharge({ type: 'special', planInstallment: true })).toEqual({ tier: 4, ambiguity: 'plan_installment' })
  })
  it('every ambiguity has text for the board', () => {
    for (const k of ['interest', 'collection_cost', 'plan_installment', 'unknown_type'] as const) expect(AMBIGUITY_TEXT[k]).toMatch(/\S/)
  })
})

describe('mode: both sides of the date and the state', () => {
  it('Georgia on 2027-01-01 applies; the day before does not', () => {
    expect(gaPaymentOrderApplies('GA', '2027-01-01')).toBe(true)
    expect(gaPaymentOrderApplies('GA', '2026-12-31')).toBe(false)
    expect(gaPaymentOrderApplies(' ga ', '2030-05-05')).toBe(true)
  })
  it('other states and unknown never apply', () => {
    for (const s of ['FL', 'CA', 'TX', '', null, undefined]) expect(gaPaymentOrderApplies(s, '2027-06-01')).toBe(false)
  })
  it('maps to the mode', () => {
    expect(allocationMode('GA', '2027-01-01')).toBe('ga_statutory')
    expect(allocationMode('GA', '2026-12-31')).toBe('oldest_first')
    expect(allocationMode('FL', '2027-01-01')).toBe('oldest_first')
  })
})

const c = (id: string, type: string, dueDate: string, remainingCents: number, extra: Partial<OpenCharge> = {}): OpenCharge => ({
  id,
  type,
  dueDate,
  remainingCents,
  ...extra,
})
const TODAY = '2027-03-15'
const ids = (a: ReturnType<typeof allocatePayment>) => a.lines.map((l) => `${l.chargeId}:${l.appliedCents}`)

describe('allocatePayment, ga_statutory', () => {
  const charges = [
    c('fine-mar', 'fine', '2027-01-05', 5000),
    c('late-feb', 'late_fee', '2027-02-10', 2500),
    c('reg-feb', 'regular', '2027-02-01', 10000),
    c('reg-jan', 'regular', '2027-01-01', 10000),
    c('spec-jan', 'special', '2027-01-15', 30000),
    c('legal', 'collection_legal', '2026-12-01', 15000),
    c('int', 'interest', '2026-12-05', 400),
  ]
  it('pays dues, then special, then specific, then other, whatever the due dates', () => {
    const a = allocatePayment({ amountCents: 1_000_000, charges, mode: 'ga_statutory', today: TODAY })
    expect(ids(a)).toEqual([
      'reg-jan:10000',
      'reg-feb:10000',
      'spec-jan:30000',
      'fine-mar:5000',
      'late-feb:2500',
      'legal:15000',
      'int:400',
    ])
    expect(a.appliedCents).toBe(72_900)
    expect(a.unappliedCents).toBe(1_000_000 - 72_900)
  })
  it('a payment that only covers part stops inside the highest unpaid rank', () => {
    const a = allocatePayment({ amountCents: 15000, charges, mode: 'ga_statutory', today: TODAY })
    expect(ids(a)).toEqual(['reg-jan:10000', 'reg-feb:5000'])
    expect(a.lines[1]!.remainingAfterCents).toBe(5000)
    expect(a.unappliedCents).toBe(0)
  })
  it('ties within a rank: oldest due first, then id', () => {
    const t = [c('b', 'regular', '2027-01-01', 100), c('a', 'regular', '2027-01-01', 100), c('z', 'regular', '2026-12-01', 100)]
    expect(ids(allocatePayment({ amountCents: 300, charges: t, mode: 'ga_statutory', today: TODAY }))).toEqual(['z:100', 'a:100', 'b:100'])
  })
  it('does not depend on input order', () => {
    const a = allocatePayment({ amountCents: 50000, charges, mode: 'ga_statutory', today: TODAY })
    const b = allocatePayment({ amountCents: 50000, charges: [...charges].reverse(), mode: 'ga_statutory', today: TODAY })
    expect(ids(b)).toEqual(ids(a))
  })
  it('never over-applies: the remainder is unapplied credit', () => {
    const a = allocatePayment({ amountCents: 20000, charges: [c('r', 'regular', '2027-01-01', 7500)], mode: 'ga_statutory', today: TODAY })
    expect(ids(a)).toEqual(['r:7500'])
    expect(a.unappliedCents).toBe(12500)
    expect(a.appliedCents + a.unappliedCents).toBe(a.totalCents)
  })
  it('charges not yet due are not paid ("until current")', () => {
    const a = allocatePayment({
      amountCents: 90000,
      charges: [c('now', 'regular', TODAY, 10000), c('later', 'regular', '2027-03-16', 10000)],
      mode: 'ga_statutory',
      today: TODAY,
    })
    expect(ids(a)).toEqual(['now:10000'])
    expect(a.unappliedCents).toBe(80000)
  })
  it('a charge with nothing remaining is skipped; no charges gives all credit', () => {
    const a = allocatePayment({
      amountCents: 100,
      charges: [c('p', 'regular', '2027-01-01', 0), c('q', 'special', '2027-01-01', 100)],
      mode: 'ga_statutory',
      today: TODAY,
    })
    expect(ids(a)).toEqual(['q:100'])
    const none = allocatePayment({ amountCents: 100, charges: [], mode: 'ga_statutory', today: TODAY })
    expect(none.lines).toEqual([])
    expect(none.unappliedCents).toBe(100)
  })
  it('a payment-plan installment is last and flagged', () => {
    const a = allocatePayment({
      amountCents: 1000,
      charges: [
        c('inst', 'special', '2027-01-01', 400, { planInstallment: true }),
        c('reg', 'regular', '2027-02-01', 400),
        c('spec', 'special', '2027-02-01', 400),
      ],
      mode: 'ga_statutory',
      today: TODAY,
    })
    expect(ids(a)).toEqual(['reg:400', 'spec:400', 'inst:200'])
    expect(ambiguitiesIn(a.lines)).toEqual(['plan_installment'])
  })
  it('exact cents: 1 cent, and exactly the dues', () => {
    expect(ids(allocatePayment({ amountCents: 1, charges, mode: 'ga_statutory', today: TODAY }))).toEqual(['reg-jan:1'])
    expect(ids(allocatePayment({ amountCents: 20000, charges, mode: 'ga_statutory', today: TODAY }))).toEqual([
      'reg-jan:10000',
      'reg-feb:10000',
    ])
  })
  it('rejects amounts and remainders that are not whole cents', () => {
    for (const bad of [0, -5, 10.5, NaN, Infinity]) {
      expect(() => allocatePayment({ amountCents: bad, charges, mode: 'ga_statutory', today: TODAY })).toThrow(RangeError)
    }
    expect(() =>
      allocatePayment({ amountCents: 100, charges: [c('x', 'regular', '2027-01-01', 10.5)], mode: 'ga_statutory', today: TODAY }),
    ).toThrow(RangeError)
  })
  it('invariants hold over many amounts', () => {
    for (let amt = 1; amt <= 80_000; amt += 997) {
      const a = allocatePayment({ amountCents: amt, charges, mode: 'ga_statutory', today: TODAY })
      expect(a.appliedCents + a.unappliedCents).toBe(amt)
      expect(a.lines.reduce((s, l) => s + l.appliedCents, 0)).toBe(a.appliedCents)
      for (const l of a.lines) {
        expect(l.appliedCents).toBeGreaterThan(0)
        expect(l.appliedCents).toBeLessThanOrEqual(l.remainingBeforeCents)
        expect(l.remainingAfterCents).toBe(l.remainingBeforeCents - l.appliedCents)
      }
      // a lower rank is touched only once the rank above it is cleared
      for (let i = 1; i < a.lines.length; i++) {
        if (a.lines[i]!.tier > a.lines[i - 1]!.tier) expect(a.lines[i - 1]!.remainingAfterCents).toBe(0)
      }
    }
  })
})

describe('allocatePayment, oldest_first (before 2027 and outside Georgia: today’s behaviour)', () => {
  const charges = [c('fine', 'fine', '2026-03-01', 5000), c('reg', 'regular', '2026-04-01', 10000), c('later', 'regular', '2026-05-01', 10000)]
  it('oldest due first whatever the type, including charges not yet due', () => {
    const a = allocatePayment({ amountCents: 20000, charges, mode: 'oldest_first', today: '2026-04-15' })
    expect(ids(a)).toEqual(['fine:5000', 'reg:10000', 'later:5000'])
  })
  it('the same charges flip to dues-first on the other side of the date', () => {
    const before = allocatePayment({ amountCents: 5000, charges, mode: allocationMode('GA', '2026-12-31'), today: '2026-12-31' })
    const after = allocatePayment({ amountCents: 5000, charges, mode: allocationMode('GA', '2027-01-01'), today: '2027-01-01' })
    expect(ids(before)).toEqual(['fine:5000'])
    expect(ids(after)).toEqual(['reg:5000'])
  })
  it('a non-Georgia association stays oldest-first after 2027', () => {
    const a = allocatePayment({ amountCents: 5000, charges, mode: allocationMode('FL', '2027-06-01'), today: '2027-06-01' })
    expect(ids(a)).toEqual(['fine:5000'])
  })
})

describe('orderForPayLines', () => {
  const lines = [
    { id: 'f', assessmentType: 'fine', dueDate: '2027-01-01' },
    { id: 'r2', assessmentType: 'regular', dueDate: '2027-02-01' },
    { id: 'r1', assessmentType: 'regular', dueDate: '2027-01-01' },
    { id: 'fut', assessmentType: 'regular', dueDate: '2027-05-01' },
    { id: 's', assessmentType: 'special', dueDate: '2026-12-01' },
  ]
  it('ga_statutory: due charges by rank, then future charges oldest first', () => {
    expect(orderForPayLines(lines, 'ga_statutory', TODAY).map((l) => l.id)).toEqual(['r1', 'r2', 's', 'f', 'fut'])
  })
  it('oldest_first is today’s order', () => {
    expect(orderForPayLines(lines, 'oldest_first', TODAY).map((l) => l.id)).toEqual(['s', 'f', 'r1', 'r2', 'fut'])
  })
  it('keeps every line exactly once', () => {
    expect(orderForPayLines(lines, 'ga_statutory', TODAY)).toHaveLength(lines.length)
  })
})
