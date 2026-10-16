import { describe, expect, it } from 'vitest'
import { buildBidPayload, describeIssues, type BidFormInput } from './bid-payload'

const base: BidFormInput = {
  totalAmount: '$32,500.50',
  paymentTerms: 'Net 30',
  warranty: '',
  startDate: '2026-11-01',
  completionDate: '',
  lines: [
    { description: 'Mowing', quantity: '3', unitPrice: '12.34', notes: '' },
    { description: '   ', quantity: '', unitPrice: '', notes: '' },
    { description: 'Edging', quantity: '', unitPrice: '', notes: 'weekly' },
  ],
}

describe('buildBidPayload', () => {
  it('builds the route payload, dropping blank lines and keeping the on-screen index', () => {
    const r = buildBidPayload(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload).toEqual({
      total_amount: 32500.5,
      payment_terms: 'Net 30',
      warranty: null,
      start_date: '2026-11-01',
      completion_date: null,
      line_items: [
        { description: 'Mowing', quantity: 3, unit_price: 12.34, notes: null },
        { description: 'Edging', quantity: null, unit_price: null, notes: 'weekly' },
      ],
    })
    expect(r.lineIndex).toEqual([0, 2])
  })

  it.each([
    ['a three-decimal unit price', { lines: [{ description: 'x', quantity: '1', unitPrice: '12.345', notes: '' }] }, 'Line item 1 unit price can have at most two decimal places.'],
    ['a three-decimal total', { totalAmount: '10.005' }, 'Total bid amount can have at most two decimal places.'],
    ['payment terms over 500 chars', { paymentTerms: 'x'.repeat(501) }, 'Payment terms must be 500 characters or fewer.'],
    ['a warranty over 500 chars', { warranty: 'x'.repeat(501) }, 'Warranty must be 500 characters or fewer.'],
    ['a line description over 500 chars', { lines: [{ description: 'x'.repeat(501), quantity: '', unitPrice: '', notes: '' }] }, 'Line item 1 description must be 500 characters or fewer.'],
    ['a zero total', { totalAmount: '0' }, 'Total bid amount is required and must be greater than zero.'],
    ['a total over $1B', { totalAmount: '1000000000.01' }, 'Total bid amount is too large.'],
    ['an unreadable quantity', { lines: [{ description: 'x', quantity: '1.2.3', unitPrice: '', notes: '' }] }, 'Line item 1 quantity must be a number.'],
  ])('names the field for %s before sending', (_l, patch, problem) => {
    const r = buildBidPayload({ ...base, ...patch })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems).toContain(problem)
  })

  it('accepts large two-decimal totals the route accepts', () => {
    const r = buildBidPayload({ ...base, totalAmount: '276651707.60' })
    expect(r.ok && r.payload.total_amount).toBe(276651707.6)
  })
})

describe('describeIssues', () => {
  it('maps route issue paths to on-screen labels', () => {
    const body = {
      error: {
        code: 'validation_failed',
        message: 'Some fields are missing or invalid.',
        issues: [
          { path: 'line_items.1.unit_price', message: 'Use at most two decimal places.' },
          { path: 'payment_terms', message: 'String must contain at most 500 character(s)' },
        ],
      },
    }
    expect(describeIssues(body, [0, 2])).toEqual([
      'Line item 3 unit price: Use at most two decimal places.',
      'Payment terms: String must contain at most 500 character(s)',
    ])
  })

  it('returns nothing for a body without issues', () => {
    expect(describeIssues({ error: { code: 'conflict', message: 'x' } })).toEqual([])
    expect(describeIssues(null)).toEqual([])
  })
})
