import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  ledger: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/impersonation', () => ({ getResidentActor: async () => ({ client: {}, orgId: null }) }))
vi.mock('@/lib/resident', () => ({ getResidentUnits: async () => [{ unit_id: 'u1' }] }))
vi.mock('@/lib/resident-dashboard', () => ({ getResidentLedger: mocks.ledger }))
vi.mock('@/lib/resident-receipt', async (orig) => ({
  ...(await orig<typeof import('@/lib/resident-receipt')>()),
  loadResidentReceipt: mocks.load,
}))

import ReceiptPage from './[id]/page'
import LedgerPage from '../ledger/page'

const PAY = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'

beforeEach(() => vi.clearAllMocks())

describe('receipt page', () => {
  it('a malformed id is notFound before anything is read', async () => {
    await expect(ReceiptPage({ params: Promise.resolve({ id: 'x; drop table' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('a payment outside the resident’s homes is notFound', async () => {
    mocks.load.mockResolvedValue({ status: 'not_found' })
    await expect(ReceiptPage({ params: Promise.resolve({ id: PAY }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the number, date, amount, method, property, allocation, credit and balance', async () => {
    mocks.load.mockResolvedValue({
      status: 'ok',
      receipt: {
        receiptNumber: 'C1C1C1C1',
        associationName: 'Oak Hollow HOA',
        paidDay: '2026-09-10',
        amount: 125,
        methodLabel: 'Check',
        propertyLabel: '4 · 12 Oak St',
        allocations: [{ label: 'Regular dues', dueDate: '2026-09-01', applied: 100 }],
        credit: 25,
        balanceAfter: -25,
      },
    })
    const html = renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ id: PAY }) }))
    for (const s of [
      'Payment receipt',
      'Oak Hollow HOA',
      'C1C1C1C1',
      'Sep 10, 2026',
      '$125.00',
      'Check',
      '12 Oak St',
      'Regular dues',
      '$100.00',
      'Credit on your account',
      '$25.00',
      '$25.00 credit',
      'Print or save PDF',
    ]) {
      expect(html).toContain(s)
    }
    expect(html).not.toContain('—')
  })

  it('omits the balance line when it cannot be proven', async () => {
    mocks.load.mockResolvedValue({
      status: 'ok',
      receipt: {
        receiptNumber: 'C1C1C1C1', associationName: null, paidDay: '2026-09-10', amount: 10, methodLabel: 'Zelle',
        propertyLabel: null, allocations: [], credit: 10, balanceAfter: null,
      },
    })
    const html = renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ id: PAY }) }))
    expect(html).not.toContain('Account balance after')
  })
})

describe('ledger rows', () => {
  it('link each payment, and only payments, to its receipt', async () => {
    mocks.ledger.mockResolvedValue({
      units: [{ unit_id: 'u1', unit_number: '4', address: '12 Oak St' }],
      truncated: false,
      ledger: {
        totals: { charges: 100, payments: 60, credits: 0, balance: 40 },
        entries: [
          { id: 'a1', date: '2026-09-01', kind: 'charge', description: 'Regular dues', unitId: 'u1', charge: 100, payment: null, balance: 100 },
          { id: PAY, date: '2026-09-10', kind: 'payment', description: 'Payment · Check', unitId: 'u1', charge: null, payment: 60, balance: 40 },
        ],
      },
    })
    const html = renderToStaticMarkup(await LedgerPage())
    expect(html).toContain(`href="/resident/dues/receipt/${PAY}"`)
    expect(html).not.toContain('/resident/dues/receipt/a1')
  })
})
