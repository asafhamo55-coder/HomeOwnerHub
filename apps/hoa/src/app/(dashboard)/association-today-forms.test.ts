import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToastProvider } from '@homeowner-portal/ui'

// BL-065: client forms default their dates to the association's today,
// handed down by the server page as a prop — not the browser's or server's
// clock, not a hard-coded Eastern day.
//
// Pinned at 22:30 Pacific on Oct 1 2026: Eastern and UTC already read Oct 2,
// so a form that still computed its own "today" would render 2026-10-02.

;(globalThis as { React?: typeof React }).React = React
const h = React.createElement
// The forms toast on submit, so they need the provider even to render.
const render = (el: React.ReactElement) => renderToStaticMarkup(h(ToastProvider, null, el))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
// Server actions: never called by a static render; mocked so no server module loads.
vi.mock('@/lib/assessments', () => ({ createDues: vi.fn() }))
vi.mock('@/lib/invoices', () => ({ enterBill: vi.fn() }))
vi.mock('@/lib/bank-reconciliation', () => ({ reconcileBankAccount: vi.fn() }))
vi.mock('@/lib/payment-plans', () => ({ createPaymentPlan: vi.fn() }))

const NOW = new Date('2026-10-02T05:30:00Z') // Oct 1 22:30 PDT; Oct 2 in Eastern and UTC
const TODAY = '2026-10-01'

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
})

const dateInputs = (html: string) =>
  [...html.matchAll(/<input[^>]*type="date"[^>]*>/g)].map((m) => m[0])

describe('form date defaults come from the association today prop', () => {
  it('NewDueForm: first due date', async () => {
    const { NewDueForm } = await import('./dues/new/NewDueForm')
    const html = render(h(NewDueForm, { units: [], today: TODAY }))
    expect(dateInputs(html).some((i) => i.includes(`value="${TODAY}"`))).toBe(true)
    expect(html).not.toContain('2026-10-02')
  })

  it('EnterBillForm: invoice date', async () => {
    const { EnterBillForm } = await import('./accounting/invoices/new/EnterBillForm')
    const html = render(h(EnterBillForm, { vendors: [], expenseAccounts: [], today: TODAY }))
    expect(dateInputs(html).some((i) => i.includes(`value="${TODAY}"`))).toBe(true)
    expect(html).not.toContain('2026-10-02')
  })

  it('ReconcileForm: statement date and its max', async () => {
    const { ReconcileForm } = await import('./accounting/bank/[accountId]/reconcile/ReconcileForm')
    const html = render(h(ReconcileForm, { bankAccountId: 'ba-1', today: TODAY }))
    const input = dateInputs(html)[0]!
    expect(input).toContain(`value="${TODAY}"`)
    expect(input).toContain(`max="${TODAY}"`)
  })

  it('NewPlanForm: start date', async () => {
    const { NewPlanForm } = await import('./accounting/payment-plans/new/NewPlanForm')
    const html = render(h(NewPlanForm, { units: [], today: TODAY }))
    expect(dateInputs(html).some((i) => i.includes(`value="${TODAY}"`))).toBe(true)
    expect(html).not.toContain('2026-10-02')
  })
  // OpenCollectionCase and RecordCollectionEvent render a button until
  // clicked, so a static render cannot reach their date inputs; their
  // required `today` prop is enforced by the typecheck instead.
})
