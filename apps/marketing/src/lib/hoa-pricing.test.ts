import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// The module checkout itself uses. It is pure (no imports), so a relative
// import keeps marketing free of the billing package's stripe + db deps.
import * as billing from '../../../../packages/billing/src/pricing'
import {
  ANNUAL_PER_DOOR_YEARLY_USD,
  HOA_PLANS,
  HOA_PRICING,
  HOA_PRICE_COPY,
  MIN_BILLABLE_DOORS,
  MIN_MONTHLY_BILL_USD,
  annualBillUsd,
  billableDoors,
  monthlyBillUsd,
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
      expect(monthlyBillUsd(doors)).toBe(billing.monthlyCostUsd(doors))
    }
  })

  it('uses the per-door amounts configured on the Stripe Prices', () => {
    expect(Math.round(HOA_PRICING.PER_DOOR_USD * 100)).toBe(stripeUnitCents('MONTHLY_UNIT_CENTS'))
    expect(Math.round(ANNUAL_PER_DOOR_YEARLY_USD * 100)).toBe(stripeUnitCents('ANNUAL_UNIT_CENTS'))
    // Annual = billable doors x the annual Price, exactly as Stripe multiplies it.
    expect(annualBillUsd(180)).toBe(9698.4)
    expect(annualBillUsd(10)).toBe(Math.round(41 * 5388) / 100)
  })

  it('states the real minimum (the ceil makes it 41 doors, not a flat $200)', () => {
    expect(MIN_BILLABLE_DOORS).toBe(41)
    expect(MIN_MONTHLY_BILL_USD).toBe(204.59)
    expect(HOA_PRICE_COPY.minimum).toContain('41-door minimum')
    expect(HOA_PRICE_COPY.minimum).toContain('$204.59')
  })

  it('offers exactly the two cadences checkout sells', () => {
    expect(HOA_PLANS.map((p) => p.cadence)).toEqual(['monthly', 'annual'])
    expect(HOA_PLANS[0].price).toBe('$4.99')
    expect(HOA_PLANS[1].price).toBe('$4.49')
    for (const p of HOA_PLANS) expect(p.sub).toContain(`first ${HOA_PRICING.COMMIT_MONTHS} months`)
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

  it('the homepage teaser and /pricing render the same plan list', () => {
    expect(read(pages.teaser)).toMatch(/HOA_PLANS/)
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
