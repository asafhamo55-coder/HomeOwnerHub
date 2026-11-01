import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-104: the one-plan copy Settings → Billing shows once
// PRICING_V2 is on. Every amount must be planPriceCents (= Stripe's tier
// arithmetic), at the band of the homes on file.

;(globalThis as { React?: typeof React }).React = React

vi.mock('@/lib/billing', () => ({ startHoaCheckout: vi.fn(), openHoaPortal: vi.fn() }))

const { planPriceCents, SOLD_PRICE_FAMILY } = await import('@homeowner-portal/billing')
const { PlanPickerV2 } = await import('./PlanPickerV2')
const { PlanTotalsV2, billingPriceCopyV2 } = await import('./price-display')

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe.each([1, 50, 51, 180, 401])('%i homes', (homes) => {
  it('the one plan card shows the band price for the chosen cadence', () => {
    const monthly = html(<PlanPickerV2 currentPlan="free" homes={homes} firstSubscription={false} initialCadence="monthly" />)
    expect(monthly).toContain(usd(planPriceCents(SOLD_PRICE_FAMILY, 'monthly', homes)))
    const annual = html(<PlanPickerV2 currentPlan="free" homes={homes} firstSubscription={false} initialCadence="annual" />)
    expect(annual).toContain(usd(planPriceCents(SOLD_PRICE_FAMILY, 'annual', homes)))
    expect(annual).toContain('2 months free')
  })

  it('sends the cadence only: no plan field (Complete cannot be picked) and never a door count', () => {
    const out = html(<PlanPickerV2 currentPlan="free" homes={homes} firstSubscription={false} initialCadence="monthly" />)
    expect(out).not.toContain('name="plan"')
    expect(out).toContain('name="cadence" value="monthly"')
    expect(out).not.toContain('name="doors"')
  })
})

describe('copy', () => {
  it('a 50-home board sees one price, with no second plan price beside it (acceptance)', () => {
    const m = html(<PlanPickerV2 currentPlan="free" homes={50} firstSubscription={false} initialCadence="monthly" />)
    expect(m).toContain(usd(planPriceCents(SOLD_PRICE_FAMILY, 'monthly', 50)))
    expect(m).not.toContain('$99.00')
    const y = html(<PlanPickerV2 currentPlan="free" homes={50} firstSubscription={false} initialCadence="annual" />)
    expect(y).toContain(usd(planPriceCents(SOLD_PRICE_FAMILY, 'annual', 50)))
    expect(y).not.toContain('$990.00')
  })

  it('no commitment copy; a first subscription offers the 30-day trial', () => {
    const out = html(<PlanPickerV2 currentPlan="free" homes={20} firstSubscription initialCadence="monthly" />)
    expect(out).toContain('Start 30-day free trial')
    expect(out).toContain('cancel any time')
    expect(out).not.toMatch(/can’t be cancelled|First-year commitment/)
  })

  it('a grandfathered $4.99/door subscriber keeps their price and cannot check out', () => {
    const out = html(<PlanPickerV2 currentPlan="monthly" homes={50} firstSubscription={false} initialCadence="monthly" />)
    expect(out).toContain('Your current price stays until your term ends')
    expect(out).toContain(`${usd(planPriceCents(SOLD_PRICE_FAMILY, 'monthly', 50))} a month`)
    expect((out.match(/disabled=""/g) ?? []).length).toBe(1)
  })

  it('0 homes: add your homes first, checkout disabled', () => {
    const out = html(<PlanPickerV2 currentPlan="free" homes={0} firstSubscription initialCadence="monthly" />)
    expect(out).toContain('Add your homes first')
    expect((out.match(/disabled=""/g) ?? []).length).toBe(1)
  })

  it('the card is headed by the product name and lists every feature, accounting and the mailbox included', () => {
    const out = html(<PlanPickerV2 currentPlan="free" homes={20} firstSubscription initialCadence="monthly" />)
    expect(out).toMatch(/<h3[^>]*>HomeownerHub<\/h3>/)
    expect(out).toContain('Accounting')
    expect(out).toContain('Shared HOA mailbox')
    expect(out).not.toMatch(/Essentials|Complete/)
    expect(out).toContain('role="radiogroup"')
    expect((out.match(/role="radio"[^>]*tabindex="0"|tabindex="0"[^>]*role="radio"/g) ?? []).length).toBeLessThanOrEqual(1)
  })

  it('a stored complete plan sees the plan as current and cannot start a second checkout', () => {
    const out = html(<PlanPickerV2 currentPlan="complete" homes={50} firstSubscription={false} initialCadence="monthly" />)
    expect(out).toContain('Current plan')
    expect((out.match(/disabled=""/g) ?? []).length).toBe(1)
  })

  it('the page description and totals', () => {
    expect(billingPriceCopyV2().description).toContain('One plan, everything included, from $')
    expect(billingPriceCopyV2().description).not.toMatch(/Essentials|Complete/)
    // Each org is shown the price of the Stripe Price it is actually on.
    expect(html(<PlanTotalsV2 homes={401} family="complete" />)).toContain('$349.85')
    expect(html(<PlanTotalsV2 homes={401} family="essentials" />)).toContain('$180.45')
    const now = html(<PlanTotalsV2 homes={401} family="homeownerhub" />)
    expect(now).toContain('$260.65')
    expect(now).toContain('401+ doors band')
    // A subscription whose Price could not be read shows the homes, never a guessed amount.
    const unknown = html(<PlanTotalsV2 homes={401} family={null} />)
    expect(unknown).toContain('401')
    expect(unknown).not.toMatch(/\$\d/)
  })
})
