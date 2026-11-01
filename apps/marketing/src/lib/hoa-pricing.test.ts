import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// The module checkout itself uses. It is pure (no imports), so a relative
// import keeps marketing free of the billing package's stripe + db deps.
import * as billing from '../../../../packages/billing/src/pricing'
import * as v2 from '../../../../packages/billing/src/pricing-v2'
import * as billingFlag from '../../../../packages/billing/src/pricing-flag'
import {
  ANNUAL_MONTHS_BILLED,
  ANNUAL_PER_DOOR_YEARLY_USD,
  BAND_EDGES,
  BAND_MONTHLY_CENTS,
  HOA_PLANS,
  HOA_PRICING,
  HOA_PRICE_COPY,
  MIN_BILLABLE_DOORS,
  MIN_MONTHLY_BILL_USD,
  OPEN_BAND_MONTHLY_CENTS,
  ONE_PLAN_NEW_PRICES,
  SOLD_BAND_PLAN,
  PRICING_V2,
  TRIAL_DAYS,
  bandAnnualUsd,
  bandMonthlyUsd,
  billableDoors,
  hoaPricingView,
  legacyAnnualBillUsd,
  legacyMonthlyBillUsd,
} from './hoa-pricing'

const here = path.dirname(fileURLToPath(import.meta.url))
const marketingSrc = path.resolve(here, '..')
const repoRoot = path.resolve(marketingSrc, '../../..')
const read = (rel: string) => readFileSync(path.join(marketingSrc, rel), 'utf8')

// The Stripe Prices checkout charges are created by the setup route from
// the cent constants in packages/billing/src/pricing.ts. Pin the marketing
// numbers to them too.
function stripeUnitCents(name: 'MONTHLY_UNIT_CENTS' | 'ANNUAL_UNIT_CENTS'): number {
  const src = readFileSync(
    path.join(repoRoot, 'packages/billing/src/pricing.ts'),
    'utf8',
  )
  const m = src.match(new RegExp(`export const ${name} = (\\d+)`))
  if (!m) throw new Error(`${name} not found in packages/billing/src/pricing.ts`)
  return Number(m[1])
}

describe('marketing HOA pricing matches what checkout charges', () => {
  it('uses the same constants as packages/billing', () => {
    expect(HOA_PRICING).toEqual(billing.PRICING)
  })

  it('bills the same doors and monthly amount as checkout, at every size', () => {
    for (const doors of [1, 25, 40, 41, 42, 50, 150, 180, 400, 1000]) {
      expect(billableDoors(doors)).toBe(billing.billableDoors(doors))
      expect(legacyMonthlyBillUsd(doors)).toBe(billing.monthlyCostUsd(doors))
    }
  })

  it('uses the per-door amounts configured on the Stripe Prices', () => {
    expect(Math.round(HOA_PRICING.PER_DOOR_USD * 100)).toBe(stripeUnitCents('MONTHLY_UNIT_CENTS'))
    expect(Math.round(ANNUAL_PER_DOOR_YEARLY_USD * 100)).toBe(stripeUnitCents('ANNUAL_UNIT_CENTS'))
    // Annual = billable doors x the annual Price, exactly as Stripe multiplies it.
    expect(legacyAnnualBillUsd(180)).toBe(9698.4)
    expect(legacyAnnualBillUsd(10)).toBe(Math.round(41 * 5388) / 100)
  })

  it('states the real minimum (the ceil makes it 41 doors, not a flat $200)', () => {
    expect(MIN_BILLABLE_DOORS).toBe(41)
    expect(MIN_MONTHLY_BILL_USD).toBe(204.59)
    expect(hoaPricingView(false).copy.minimum).toContain('41-door minimum')
    expect(hoaPricingView(false).copy.minimum).toContain('$204.59')
  })

  it('the legacy view offers exactly the two cadences checkout sells', () => {
    const plans = hoaPricingView(false).plans
    expect(plans.map((p) => p.id)).toEqual(['monthly', 'annual'])
    expect(plans[0]!.price).toBe('$4.99')
    expect(plans[1]!.price).toBe('$4.49')
    for (const p of plans) expect(p.sub).toContain(`first ${HOA_PRICING.COMMIT_MONTHS} months`)
  })
})

describe('BL-104 band pricing (behind PRICING_V2)', () => {
  it('the flags mirror packages/billing (the site and checkout switch in one commit)', () => {
    expect(PRICING_V2).toBe(billingFlag.PRICING_V2)
    expect(ONE_PLAN_NEW_PRICES).toBe(billingFlag.ONE_PLAN_NEW_PRICES)
    expect(SOLD_BAND_PLAN).toBe(v2.SOLD_PRICE_FAMILY)
  })

  it('the pages get the view the flag selects', () => {
    expect(HOA_PLANS).toEqual(hoaPricingView(PRICING_V2).plans)
    expect(HOA_PRICE_COPY).toEqual(hoaPricingView(PRICING_V2).copy)
  })

  it('the band tables are the ones checkout and the Stripe tiers use', () => {
    expect(BAND_MONTHLY_CENTS).toEqual(v2.BAND_MONTHLY_CENTS)
    expect(OPEN_BAND_MONTHLY_CENTS).toEqual(v2.OPEN_BAND_MONTHLY_CENTS)
    expect(ANNUAL_MONTHS_BILLED).toBe(v2.ANNUAL_MONTHS_BILLED)
    expect(TRIAL_DAYS).toBe(v2.TRIAL_DAYS)
    expect([...BAND_EDGES]).toEqual(v2.BANDS.filter((b) => b.maxDoors !== null).map((b) => b.maxDoors))
  })

  it('marketing and checkout show the same numbers at every size, 1–2,000 doors', () => {
    for (const plan of v2.PRICE_FAMILY_IDS) {
      for (let d = 1; d <= 2000; d++) {
        expect(Math.round(bandMonthlyUsd(plan, d) * 100)).toBe(v2.planPriceCents(plan, 'monthly', d))
        expect(Math.round(bandAnnualUsd(plan, d) * 100)).toBe(v2.planPriceCents(plan, 'annual', d))
      }
    }
  })

  it('the old table (flag off): one plan from the 1–50 band at $49, month to month, no minimum', () => {
    const view = hoaPricingView(true, false)
    expect(view.plans.map((p) => [p.id, p.name, p.price])).toEqual([['essentials', 'HomeownerHub', '$49']])
    // Nothing the site shows names a second plan or the Complete price.
    expect(JSON.stringify([view.plans, view.copy])).not.toMatch(/Complete|Essentials|\$99/)
    expect(view.copy.contract).toContain('month to month')
    expect(view.copy.contract).not.toMatch(/can't be cancelled/)
    expect(view.monthlyBillUsd(180)).toBe(119)
    expect(view.annualBillUsd(180)).toBe(1190)
    expect(view.monthlyBillUsd(401)).toBe(180.45)
    expect(view.minBillableDoors).toBe(0)
  })

  it('the new table (flag on): $59 / $109 / $169 / $249 / $0.65 a home, yearly 10 x', () => {
    const view = hoaPricingView(true, true)
    expect(view.plans.map((p) => [p.id, p.name, p.price])).toEqual([['homeownerhub', 'HomeownerHub', '$59']])
    expect(JSON.stringify([view.plans, view.copy])).not.toMatch(/Complete|Essentials|\$99/)
    expect([1, 50, 51, 100, 101, 200, 201, 400].map((d) => view.monthlyBillUsd(d))).toEqual([59, 59, 109, 109, 169, 169, 249, 249])
    expect([50, 100, 200, 400].map((d) => view.annualBillUsd(d))).toEqual([590, 1090, 1690, 2490])
    expect(view.monthlyBillUsd(401)).toBe(260.65)
    expect(view.annualBillUsd(401)).toBe(2606.5)
    expect(view.copy.summary).toContain('from $59 a month')
  })

  it('the pages show the table the flag selects', () => {
    expect(HOA_PLANS[0]!.id).toBe(ONE_PLAN_NEW_PRICES ? 'homeownerhub' : 'essentials')
  })
})

describe('every page that shows an HOA price derives it from hoa-pricing', () => {
  const pages = {
    teaser: 'components/site/pricing-teaser.tsx',
    pricing: 'app/pricing/page.tsx',
    compare: 'app/compare/page.tsx',
    roi: 'components/site/roi-calculator.tsx',
    demo: 'app/demo/page.tsx',
  }

  it.each(Object.entries(pages))('%s imports the shared module', (_name, rel) => {
    expect(read(rel)).toMatch(/from '@\/lib\/hoa-pricing'/)
  })

  it('the homepage slider prices from the same band functions /pricing mirrors', () => {
    expect(read(pages.teaser)).toMatch(/bandMonthlyUsd/)
    expect(read(pages.pricing)).toMatch(/HOA_PLANS/)
  })

  // Old flat tiers and hand-typed HOA prices. Any of these back in a page
  // means a price that no longer comes from checkout's numbers.
  const STALE = ['$39', '$79', '$149', '$40 and $150', '4.99', '4.49', '$200', '$948', '18 months']
  it.each(Object.entries(pages))('%s has no hand-typed HOA price', (_name, rel) => {
    const src = read(rel)
    for (const s of STALE) expect(src, `${rel} contains "${s}"`).not.toContain(s)
  })
})
