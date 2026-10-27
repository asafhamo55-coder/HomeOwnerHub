import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LedgerAssessment } from '@/lib/resident-ledger'
import { GA_SB406_2027_FILE } from '@/lib/compliance/statute-drift'
import type { DuesRate } from '@/lib/dues-rates/model'
import { GaThresholdCards } from '@/app/(dashboard)/properties/[id]/GaThresholdPanel'
import {
  GA_PAYMENT_ORDER_QUOTES,
  GA_PAYMENT_ORDER_STEPS,
  GA_THRESHOLD_PANEL_QUOTES,
  gaThresholdView,
  threshold2027Status,
  twelveMonthsFrom,
} from './ga-threshold'
import { gaForeclosureCount, letterFigures, type LetterInput } from './letters/model'

;(globalThis as { React?: typeof React }).React = React

/**
 * BL-158: the Georgia foreclosure-threshold panel and the SB 406
 * payment-order note. Read-only figures, date-aware, quotes only from the
 * official SB 406 text, each checked word for word.
 */

const UNIT = '11111111-1111-4111-8111-111111111111'
const PROPERTY = '22222222-2222-4222-8222-222222222222'
const BEFORE = '2026-10-26'
const AFTER = '2027-02-01'

const charge = (id: string, due: string, amount: number, type = 'regular'): LedgerAssessment => ({
  id,
  unit_id: UNIT,
  amount,
  due_date: due,
  status: 'open',
  assessment_type: type,
  memo_code: null,
})

/** $2,400 of quarterly dues, a $60 late fee, a $150 fine and $400 of attorney's fees, all past due. */
function gaInput(over: Partial<LetterInput> = {}): LetterInput {
  return {
    state: 'GA',
    associationName: 'Peachtree Fixture HOA',
    propertyId: PROPERTY,
    address: '9 Magnolia Way, Marietta GA 30060',
    unitNumber: null,
    unitId: UNIT,
    lotNumber: '12',
    owners: ['Owner A'],
    charges: [
      charge('q1', '2026-01-01', 600),
      charge('q2', '2026-04-01', 600),
      charge('q3', '2026-07-01', 600),
      charge('q4', '2026-10-01', 600),
      charge('lf-1', '2026-01-15', 60, 'late_fee'),
      charge('fine-1', '2026-05-01', 150, 'fine'),
      charge('legal-1', '2026-09-01', 400, 'collection_legal'),
    ],
    payments: [],
    plans: [],
    planInstallmentIds: [],
    timeZone: 'America/New_York',
    ...over,
  }
}

const rate = (over: Partial<DuesRate> = {}): DuesRate => ({
  id: 'r1',
  associationId: 'a1',
  effectiveFrom: '2026-01-01',
  basis: 'per_home',
  amountCents: 25_000,
  frequency: 'monthly',
  budgetId: null,
  notes: null,
  ...over,
})

const OFF = { rates: [] as DuesRate[], live: false }

describe('BL-158 gaThresholdView', () => {
  it('is null outside Georgia', () => {
    expect(gaThresholdView(gaInput({ state: 'FL' }), BEFORE, OFF)).toBeNull()
    expect(gaThresholdView(gaInput({ state: null as never }), BEFORE, OFF)).toBeNull()
  })

  it('BL-155: a Georgia condominium gets the § 43-17A-8 payment-order card only, never the POA Act threshold', () => {
    for (const asOf of [BEFORE, AFTER]) {
      const v = gaThresholdView(gaInput({ associationType: 'condo' }), asOf, OFF)!
      expect(v.condo).toBe(true)
      expect(v.current).toBeNull()
      const html = renderToStaticMarkup(<GaThresholdCards view={v} />)
      expect(html).toContain('How payments should be applied')
      expect(html).toContain('§ 43-17A-8')
      expect(html).not.toContain('Georgia foreclosure threshold')
      expect(html).not.toContain('44-3-232')
      expect(html).toContain(asOf < '2027-01-01' ? 'From Jan 1, 2027' : 'Since Jan 1, 2027')
    }
    for (const associationType of ['hoa', null]) {
      const v = gaThresholdView(gaInput({ associationType }), BEFORE, OFF)!
      expect(v.condo).toBe(false)
      expect(renderToStaticMarkup(<GaThresholdCards view={v} />)).toContain('Georgia foreclosure threshold')
    }
  })

  it('before 2027: the $2,000 floor is the rule today, and the 2027 count is a preview', () => {
    const v = gaThresholdView(gaInput(), BEFORE, OFF)!
    expect(v.sb406InForce).toBe(false)
    expect(v.changesOn).toBe('2027-01-01')
    // Today's lien, as the notice before foreclosure lists it: dues, late fee, fine, legal.
    expect(v.current).toEqual({ lienCents: 301_000, floorCents: 200_000, status: 'at_or_above' })
    expect(v.rule2027.countedCents).toBe(240_000)
    expect(v.rule2027.excludedCents).toBe(61_000)
    expect(v.rule2027.twelve).toEqual({ kind: 'missing', reason: 'not_live' })
    expect(v.rule2027.thresholdCents).toBeNull()
    expect(v.rule2027.status).toBe('depends')
  })

  it('before 2027: a lien under $2,000 is below today’s rule', () => {
    const v = gaThresholdView(gaInput({ charges: [charge('q1', '2026-01-01', 600), charge('fine-1', '2026-05-01', 900, 'fine')] }), BEFORE, OFF)!
    expect(v.current).toMatchObject({ lienCents: 150_000, status: 'below' })
    expect(v.rule2027.status).toBe('below')
  })

  it('from 2027: no "today’s rule" block; the threshold comes from the dues schedule', () => {
    const v = gaThresholdView(gaInput(), AFTER, { rates: [rate()], live: true })!
    expect(v.sb406InForce).toBe(true)
    expect(v.current).toBeNull()
    expect(v.rule2027.twelve).toEqual({ kind: 'schedule', cents: 300_000, rateLabel: '$250.00 a month', effectiveFrom: '2026-01-01' })
    expect(v.rule2027.thresholdCents).toBe(300_000)
    expect(v.rule2027.status).toBe('below')

    const low = gaThresholdView(gaInput(), AFTER, { rates: [rate({ amountCents: 15_000 })], live: true })!
    expect(low.rule2027.thresholdCents).toBe(200_000) // 12 × $150 = $1,800, floored at $2,000
    expect(low.rule2027.status).toBe('at_or_above')

    const high = gaThresholdView(gaInput(), AFTER, { rates: [rate({ amountCents: 50_000 })], live: true })!
    expect(high.rule2027.thresholdCents).toBe(400_000) // capped at $4,000
  })

  it('reuses BL-154’s count: unapplied credit comes off, plan installments and fees stay out', () => {
    const input = gaInput({
      charges: [...gaInput().charges, charge('pi-1', '2026-06-01', 300)],
      planInstallmentIds: ['pi-1'],
      payments: [{ id: 'p1', unit_id: UNIT, amount: 100, paid_at: '2026-08-01T12:00:00Z', assessment_id: null, payment_method: 'check' }],
    })
    const v = gaThresholdView(input, AFTER, OFF)!
    const bl154 = gaForeclosureCount(letterFigures(input, 'ga_pre_foreclosure', AFTER))
    expect(v.rule2027.countedCents).toBe(bl154.countedCents)
    expect(v.rule2027.planCents).toBe(bl154.planCents)
    expect(v.rule2027.planCents).toBe(30_000)
    expect(v.rule2027.creditCents).toBe(-10_000)
    expect(v.rule2027.countedCents).toBe(230_000)
  })
})

describe('BL-158 12 months of regular assessments', () => {
  it('uses the per-home rate in effect on the day, and says why when there is none', () => {
    expect(twelveMonthsFrom([], false, AFTER)).toEqual({ kind: 'missing', reason: 'not_live' })
    expect(twelveMonthsFrom(null, true, AFTER)).toEqual({ kind: 'missing', reason: 'failed' })
    expect(twelveMonthsFrom([rate({ effectiveFrom: '2027-06-01' })], true, AFTER)).toEqual({ kind: 'missing', reason: 'no_rate' })
    expect(twelveMonthsFrom([rate({ basis: 'per_share' })], true, AFTER)).toEqual({ kind: 'missing', reason: 'no_rate' })
    const later = rate({ id: 'r2', effectiveFrom: '2027-01-01', amountCents: 90_000, frequency: 'quarterly' })
    expect(twelveMonthsFrom([rate(), later], true, AFTER)).toMatchObject({ kind: 'schedule', cents: 360_000 })
  })

  it('without a figure, the threshold is a $2,000–$4,000 range', () => {
    const none = { kind: 'missing', reason: 'no_rate' } as const
    expect(threshold2027Status(400_000, none)).toEqual({ thresholdCents: null, status: 'at_or_above' })
    expect(threshold2027Status(399_999, none)).toEqual({ thresholdCents: null, status: 'depends' })
    expect(threshold2027Status(200_000, none)).toEqual({ thresholdCents: null, status: 'depends' })
    expect(threshold2027Status(199_999, none)).toEqual({ thresholdCents: null, status: 'below' })
  })
})

// ─── quotes: only from the official SB 406 text, word for word ─────────

const REPO_ROOT = resolve(__dirname, '../../../../..')
const squash = (s: string) => s.replace(/\s+/g, ' ')
const sb406 = readFileSync(resolve(REPO_ROOT, 'scripts/fixtures/state-law', GA_SB406_2027_FILE), 'utf8')
const between = (start: string, end: string) => {
  const a = sb406.indexOf(start)
  expect(a, start).toBeGreaterThanOrEqual(0)
  const b = sb406.indexOf(end, a + start.length)
  return squash(sb406.slice(a, b === -1 ? undefined : b))
}
const s232c = between('=== SECTION 5. (O.C.G.A. § 44-3-232(c)', '\n=== ')
const ch17A = (n: number) => between(`\n43-17A-${n}.\n`, `\n43-17A-${n + 1}.\n`)

describe('BL-158 quotes', () => {
  const all = [...GA_THRESHOLD_PANEL_QUOTES, ...GA_PAYMENT_ORDER_QUOTES]

  it('every quote comes from ga-sb406-2026-2027-text.txt', () => {
    for (const q of all) expect(q.fixture, q.cite).toBe('ga-sb406-2026-2027-text.txt')
  })

  it('each is word for word in the subdivision it cites', () => {
    const [minimum, specific] = GA_THRESHOLD_PANEL_QUOTES
    const [order, noRefusal] = GA_PAYMENT_ORDER_QUOTES
    expect(minimum!.cite).toMatch(/^O\.C\.G\.A\. § 44-3-232\(c\)/)
    expect(s232c).toContain(squash(minimum!.quote))
    expect(specific!.cite).toMatch(/^O\.C\.G\.A\. § 43-17A-1\(10\)/)
    expect(ch17A(1)).toContain(`(10) ${squash(specific!.quote)}`)
    expect(order!.cite).toMatch(/^O\.C\.G\.A\. § 43-17A-8\(a\)/)
    expect(ch17A(8)).toContain(`(a) ${squash(order!.quote)}`)
    expect(noRefusal!.cite).toMatch(/^O\.C\.G\.A\. § 43-17A-8\(b\)/)
    expect(ch17A(8)).toContain(`(b) ${squash(noRefusal!.quote)}`)
  })

  it('the plain-words order follows § 43-17A-8(a)’s four ranks', () => {
    const a = ch17A(8)
    const ranks = ['(1) Regular assessments or dues until current', '(2) Special assessments until current', '(3) Specific assessments until current', '(4) Other fees and fines']
    let at = -1
    for (const r of ranks) {
      const i = a.indexOf(r)
      expect(i, r).toBeGreaterThan(at)
      at = i
    }
    expect(GA_PAYMENT_ORDER_STEPS).toHaveLength(4)
    expect(GA_PAYMENT_ORDER_STEPS[0]).toMatch(/^Regular assessments/)
    expect(GA_PAYMENT_ORDER_STEPS[1]).toMatch(/^Special assessments/)
    expect(GA_PAYMENT_ORDER_STEPS[2]).toMatch(/^Specific assessments/)
    expect(GA_PAYMENT_ORDER_STEPS[3]).toBe('Other fees and fines')
  })
})

// ─── the rendered panel ──────────────────────────────────────────────

const decode = (html: string) =>
  html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const text = (html: string) => squash(decode(html.replace(/<[^>]+>/g, ' ')))

describe('BL-158 panel', () => {
  it('before 2027 shows the $2,000 floor and "Changes on Jan 1, 2027", every quote verbatim, and no button', () => {
    const html = renderToStaticMarkup(<GaThresholdCards view={gaThresholdView(gaInput(), BEFORE, OFF)!} />)
    const t = text(html)
    expect(t).toContain('the lien can’t be foreclosed unless it is at least $2,000.00')
    expect(t).toContain('Changes on Jan 1, 2027.')
    expect(t).toContain('From Jan 1, 2027 (SB 406 § 5)')
    expect(t).toContain('$3,010.00')
    expect(t).toContain('$2,400.00')
    expect(t).toContain('$2,000.00 to $4,000.00')
    expect(t).toContain('Depends on 12 months of dues')
    for (const q of [...GA_THRESHOLD_PANEL_QUOTES, ...GA_PAYMENT_ORDER_QUOTES]) expect(t).toContain(squash(q.quote))
    expect(html).not.toMatch(/<(button|form|input)\b/)
  })

  it('from 2027 shows the rule in force, the threshold and the verdict', () => {
    const html = renderToStaticMarkup(<GaThresholdCards view={gaThresholdView(gaInput(), AFTER, { rates: [rate()], live: true })!} />)
    const t = text(html)
    expect(t).not.toContain('Changes on')
    expect(t).not.toContain('The rule today')
    expect(t).toContain('Since Jan 1, 2027 (SB 406 § 5)')
    expect(t).toContain('$3,000.00 ($250.00 a month')
    expect(t).toContain('Below $3,000.00')
    expect(t).toContain('Record payment on the Dues page splits one payment in this order')
    expect(t).toContain('doesn’t re-apply past payments')
  })
})
