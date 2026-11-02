import { describe, expect, it } from 'vitest'
import { customAmountError, parseDollarsToCents, payOptionsFor } from './pay-amount'
import { DEFAULT_FEE_POLICY } from './fees'

describe('parseDollarsToCents', () => {
  it.each([
    ['250', 25000],
    ['$250', 25000],
    ['250.5', 25050],
    ['250.05', 25005],
    ['1,250.00', 125000],
    ['  $ 99.99 ', 9999],
  ])('reads %s', (typed, cents) => expect(parseDollarsToCents(typed)).toBe(cents))

  it.each(['', 'abc', '-5', '0', '0.00', '12.345', '1,25', '12 dollars', '1e3', '$'])('rejects %s', (typed) =>
    expect(parseDollarsToCents(typed)).toBeNull(),
  )
})

describe('customAmountError', () => {
  it('accepts anything from $1.00 up to what is owed', () => {
    expect(customAmountError('1', 30000)).toBeNull()
    expect(customAmountError('300', 30000)).toBeNull()
  })

  it('says why in plain words, with dollars', () => {
    expect(customAmountError('abc', 30000)).toMatch(/dollars and cents/)
    expect(customAmountError('0.50', 30000)).toBe('The smallest payment is $1.00.')
    expect(customAmountError('300.01', 30000)).toBe('That is more than you owe right now. The most you can pay is $300.00.')
  })

  it('has no em dashes', () => {
    for (const t of ['abc', '0.50', '999']) expect(customAmountError(t, 30000)).not.toContain('—')
  })
})

describe('payOptionsFor', () => {
  it('prices each way to pay with the one fee engine, total = dues + fee only when the resident pays it', () => {
    const opts = payOptionsFor(10000, { ...DEFAULT_FEE_POLICY, cardFeePayer: 'homeowner', cardFeeAcknowledged: true, state: 'GA' })
    const ach = opts.find((o) => o.method === 'ach')!
    const card = opts.find((o) => o.method === 'card')!
    expect(ach.feePayer).toBe('association')
    expect(ach.totalCents).toBe(10000)
    expect(card.feePayer).toBe('homeowner')
    expect(card.totalCents).toBe(10000 + card.feeCents)
  })

  it('a different amount changes the fee, so the preview cannot reuse the full-amount price', () => {
    const policy = { ...DEFAULT_FEE_POLICY, cardFeePayer: 'homeowner' as const, cardFeeAcknowledged: true, state: 'GA' }
    const full = payOptionsFor(30000, policy).find((o) => o.method === 'card')!
    const part = payOptionsFor(5000, policy).find((o) => o.method === 'card')!
    expect(part.feeCents).toBeLessThan(full.feeCents)
  })
})
