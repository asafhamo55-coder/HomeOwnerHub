import { describe, it, expect } from 'vitest'
import { chargeTypeLabel, CHARGE_TYPE_LABELS } from './assessment-labels'

describe('chargeTypeLabel', () => {
  it('maps the four known assessment types', () => {
    expect(chargeTypeLabel('regular')).toBe('Regular dues')
    expect(chargeTypeLabel('special')).toBe('Special assessment')
    expect(chargeTypeLabel('late_fee')).toBe('Late fee')
    expect(chargeTypeLabel('fine')).toBe('Fine')
  })

  it('humanizes an unknown snake_case type rather than showing the raw slug', () => {
    expect(chargeTypeLabel('parking_permit')).toBe('Parking permit')
  })

  it('leaves an unknown single word capitalized', () => {
    expect(chargeTypeLabel('interest')).toBe('Interest')
  })

  it('exposes the label map for callers that need to enumerate types', () => {
    expect(Object.keys(CHARGE_TYPE_LABELS)).toContain('regular')
  })
})
