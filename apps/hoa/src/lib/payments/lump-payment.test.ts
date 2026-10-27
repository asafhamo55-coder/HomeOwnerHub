import { describe, expect, it } from 'vitest'
import { buildLumpPreview, expectedOf, parseDollarsToCents, sameSplit } from './lump-payment'

describe('parseDollarsToCents', () => {
  it.each([
    ['100', 10000],
    ['$1,234.50', 123450],
    ['0.01', 1],
    [' 12.3 ', 1230],
  ])('%s -> %i', (text, cents) => expect(parseDollarsToCents(text)).toBe(cents))
  it.each(['', '0', '0.00', '-5', '1.234', 'abc', '1e3', '10000000.00', '1.'])('rejects %j', (text) =>
    expect(parseDollarsToCents(text)).toBeNull(),
  )
})

describe('buildLumpPreview / sameSplit', () => {
  const charges = [
    { id: 'a', type: 'fine', dueDate: '2027-01-01', remainingCents: 5000 },
    { id: 'b', type: 'regular', dueDate: '2027-02-01', remainingCents: 10000 },
  ]
  it('GA from 2027 lists dues first, with the statute’s words and the citation', () => {
    const p = buildLumpPreview({ state: 'GA', today: '2027-03-01', amountCents: 12000, charges })
    expect(p.lines.map((l) => [l.chargeId, l.appliedCents, l.tier])).toEqual([['b', 10000, 1], ['a', 2000, 3]])
    expect(p.citation?.cite).toContain('43-17A-8(a)')
    expect(p.lines[0]!.label).toBe('Regular dues')
  })
  it('before 2027 there are no tiers, quotes or citation', () => {
    const p = buildLumpPreview({ state: 'GA', today: '2026-12-31', amountCents: 12000, charges })
    expect(p.mode).toBe('oldest_first')
    expect(p.lines.map((l) => l.chargeId)).toEqual(['a', 'b'])
    expect(p.lines.every((l) => l.tier === null && l.tierQuote === null)).toBe(true)
    expect(p.citation).toBeNull()
  })
  it('sameSplit is exact: charge, cents and order', () => {
    const p = buildLumpPreview({ state: 'GA', today: '2027-03-01', amountCents: 12000, charges })
    expect(sameSplit(expectedOf(p), p)).toBe(true)
    expect(sameSplit([], p)).toBe(false)
    expect(sameSplit([...expectedOf(p)].reverse(), p)).toBe(false)
    expect(sameSplit(expectedOf(p).map((e) => ({ ...e, cents: e.cents + 1 })), p)).toBe(false)
  })
})
