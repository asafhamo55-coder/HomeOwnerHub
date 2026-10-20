import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-104: the Essentials / Complete copy Settings → Billing shows once
// PRICING_V2 is on. Every amount must be planPriceCents (= Stripe's tier
// arithmetic), at the band of the homes on file.

;(globalThis as { React?: typeof React }).React = React

vi.mock('@/lib/billing', () => ({ startHoaCheckout: vi.fn(), openHoaPortal: vi.fn() }))

const { planPriceCents } = await import('@homeowner-portal/billing')
const { PlanPickerV2 } = await import('./PlanPickerV2')
const { PlanTotalsV2, billingPriceCopyV2 } = await import('./price-display')

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe.each([1, 50, 51, 180, 401])('%i homes', (homes) => {
  it('both plan cards show the band price for the chosen cadence', () => {
    const monthly = html(<PlanPickerV2 currentPlan="free" homes={homes} firstSubscription={false} initialCadence="monthly" />)
    expect(monthly).toContain(usd(planPriceCents('essentials', 'monthly', homes)))
    expect(monthly).toContain(usd(planPriceCents('complete', 'monthly', homes)))
    const annual = html(<PlanPickerV2 currentPlan="free" homes={homes} firstSubscription={false} initialCadence="annual" />)
    expect(annual).toContain(usd(planPriceCents('essentials', 'annual', homes)))
    expect(annual).toContain(usd(planPriceCents('complete', 'annual', homes)))
    expect(annual).toContain('2 months free')
  })

  it('sends plan and cadence, never a door count', () => {
    const out = html(<PlanPickerV2 currentPlan="free" homes={homes} firstSubscription={false} initialCadence="monthly" />)
    expect(out).toContain('name="plan" value="essentials"')
    expect(out).toContain('name="plan" value="complete"')
    expect(out).toContain('name="cadence" value="monthly"')
    expect(out).not.toContain('name="doors"')
  })
})

describe('copy', () => {
  it('a 50-home board sees $49 / $99 a month and $490 / $990 a year (acceptance)', () => {
    const m = html(<PlanPickerV2 currentPlan="free" homes={50} firstSubscription={false} initialCadence="monthly" />)
    expect(m).toContain('$49.00')
    expect(m).toContain('$99.00')
    const y = html(<PlanPickerV2 currentPlan="free" homes={50} firstSubscription={false} initialCadence="annual" />)
    expect(y).toContain('$490.00')
    expect(y).toContain('$990.00')
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
    expect(out).toContain('$99.00 a month')
    expect((out.match(/disabled=""/g) ?? []).length).toBe(2)
  })

  it('0 homes: add your homes first, checkout disabled', () => {
    const out = html(<PlanPickerV2 currentPlan="free" homes={0} firstSubscription initialCadence="monthly" />)
    expect(out).toContain('Add your homes first')
    expect((out.match(/disabled=""/g) ?? []).length).toBe(2)
  })

  it('the page description and totals', () => {
    expect(billingPriceCopyV2().description).toContain('Essentials from $49/month, Complete from $99/month')
    const totals = html(<PlanTotalsV2 homes={401} plan="complete" />)
    expect(totals).toContain('$349.85')
    expect(totals).toContain('401+ doors band')
  })
})
