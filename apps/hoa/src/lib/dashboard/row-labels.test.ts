import { describe, expect, it } from 'vitest'
import { overdueUnitLabel, waitingLabel } from './row-labels'

// Copy found in the 2026-10-20 prod ui-shots review (dashboard--*.png).

describe('overdueUnitLabel', () => {
  it('names the home by address, so a single-family row no longer reads "Unit · $8,975"', () => {
    expect(overdueUnitLabel({ address_line1: '101 Demo Court', unit_number: null })).toBe('101 Demo Court')
  })

  it('adds the unit number after the address, like a cure-deadline row', () => {
    expect(overdueUnitLabel({ address_line1: '1200 Long Blvd', unit_number: '4B' })).toBe('1200 Long Blvd · 4B')
  })

  it('falls back to the unit number, then to a phrase that is not a bare "Unit"', () => {
    expect(overdueUnitLabel({ address_line1: '  ', unit_number: '7' })).toBe('Unit 7')
    expect(overdueUnitLabel(null)).toBe('Home not on file')
  })
})

describe('waitingLabel', () => {
  const NOW = Date.parse('2026-10-20T18:00:00Z')
  const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

  it('says "new today" under a day, not "waiting today"', () => {
    expect(waitingLabel(ago(0.2), NOW)).toBe('new today')
    expect(waitingLabel(ago(-1), NOW)).toBe('new today')
  })

  it('counts days and months with the right plural', () => {
    expect(waitingLabel(ago(1), NOW)).toBe('waiting 1 day')
    expect(waitingLabel(ago(3), NOW)).toBe('waiting 3 days')
    expect(waitingLabel(ago(31), NOW)).toBe('waiting 1 month')
    expect(waitingLabel(ago(65), NOW)).toBe('waiting 2 months')
  })

  it('is empty when there is no date', () => {
    expect(waitingLabel(null, NOW)).toBe('')
    expect(waitingLabel('not a date', NOW)).toBe('')
  })
})
