import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Every price Settings → Billing shows is Stripe's arithmetic: the
// Price's unit_amount × quantity (billable doors). BL-042 found the
// annual figure computed another way ($9,700.56 shown, $9,698.40 charged
// at 180 doors). These render the real components and compare against
// the cents the Stripe Prices are created with.

;(globalThis as { React?: typeof React }).React = React

vi.mock('@/lib/billing', () => ({ startHoaCheckout: vi.fn(), openHoaPortal: vi.fn() }))

const { ANNUAL_UNIT_CENTS, MONTHLY_UNIT_CENTS, billableDoors } = await import('@homeowner-portal/billing')
const { PlanPicker } = await import('./PlanPicker')
const { PlanTotals, billingPriceCopy } = await import('./price-display')

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe.each([25, 41, 50, 180, 400])('%i doors', (doors) => {
  const qty = billableDoors(doors)
  const monthly = usd(MONTHLY_UNIT_CENTS * qty)
  const annual = usd(ANNUAL_UNIT_CENTS * qty)
  const savings = usd(MONTHLY_UNIT_CENTS * qty * 12 - ANNUAL_UNIT_CENTS * qty)

  it('the plan totals show unit_amount × quantity for both cadences', () => {
    const out = html(<PlanTotals doors={doors} />)
    expect(out).toContain(monthly)
    expect(out).toContain(annual)
    expect(out).toContain(`${savings} less than monthly`)
  })

  it('the monthly plan card shows the monthly charge', () => {
    const out = html(<PlanPicker currentPlan="free" doors={doors} initialCadence="monthly" />)
    expect(out).toContain(monthly)
    expect(out).toContain(`Subscribe monthly · ${monthly}`)
    expect(out).toContain(`value="${qty}"`) // the quantity checkout sends
  })

  it('the annual plan card shows the annual charge and the true savings', () => {
    const out = html(<PlanPicker currentPlan="free" doors={doors} initialCadence="annual" />)
    expect(out).toContain(`Subscribe annually · ${annual}`)
    expect(out).toContain(`saves ${savings} vs paying monthly`)
    expect(out).toContain('$53.88 per door per year')
  })
})

describe('the minimum', () => {
  it('is stated as Stripe bills it: 41 doors, $204.59 a month', () => {
    expect(billingPriceCopy().description).toContain('41-door minimum ($204.59/month)')
    const out = html(<PlanPicker currentPlan="free" doors={25} initialCadence="monthly" />)
    expect(out).toContain('41-door minimum ($204.59/month) applied')
    expect(out).not.toContain('$200')
  })

  it('180 doors annual reads $9,698.40 — never $9,700.56', () => {
    const out = html(<PlanTotals doors={180} />)
    expect(out).toContain('$9,698.40')
    expect(out).not.toContain('9,700.56')
  })
})

describe('the current plan matches the plan on file (past-due shot: "Monthly plan" pill, Annual marked Current)', () => {
  it('a monthly subscriber opens on Monthly, marked Current', () => {
    const out = html(<PlanPicker currentPlan="monthly" doors={48} />)
    expect(out).toMatch(/aria-checked="true"[^>]*>Monthly/)
    expect(out).toContain('>Current<')
    expect(out).toContain('Current plan')
  })

  it('an annual subscriber opens on Annual, marked Current', () => {
    const out = html(<PlanPicker currentPlan="annual" doors={48} />)
    expect(out).toMatch(/aria-checked="true"[^>]*>Annual/)
    expect(out).toContain('Current plan')
  })

  it('the other cadence is not marked Current and cannot start a second checkout', () => {
    const out = html(<PlanPicker currentPlan="monthly" doors={48} initialCadence="annual" />)
    expect(out).not.toContain('>Current<')
    expect(out).toContain('Your plan is billed monthly')
    expect(out).not.toContain('Subscribe annually')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/)
  })
})

describe('billing unavailable', () => {
  it('never names an env var to the customer; the detail goes to the server log', async () => {
    const { BillingUnavailable, logBillingUnavailable } = await import('./BillingUnavailable')
    const out = html(<BillingUnavailable />)
    expect(out).toContain('Billing isn’t available right now')
    expect(out).not.toMatch(/STRIPE_|Stripe isn|environment/i)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logBillingUnavailable('org-1', false)
    expect(JSON.stringify(spy.mock.calls)).toContain('STRIPE_SECRET_KEY')
    spy.mockRestore()
  })
})
