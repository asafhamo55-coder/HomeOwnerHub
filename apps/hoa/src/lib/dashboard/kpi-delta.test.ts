import { describe, expect, it } from 'vitest'
import { kpiDelta } from './kpi-delta'

describe('kpiDelta', () => {
  it('returns nothing without a baseline', () => {
    expect(kpiDelta(5, null, true)).toBeUndefined()
  })

  it('says "No change" for a flat value', () => {
    expect(kpiDelta(5, 5, true)).toMatchObject({ value: 'No change', direction: 'flat', sentiment: 'neutral' })
  })

  it('marks a rise as negative when up is bad, with an explicit sign', () => {
    expect(kpiDelta(150, 100, true)).toMatchObject({ value: '+50%', direction: 'up', sentiment: 'negative' })
  })

  it('marks a fall as positive when up is bad', () => {
    expect(kpiDelta(50, 100, true)).toMatchObject({ value: '−50%', direction: 'down', sentiment: 'positive' })
  })

  it('uses the absolute difference when the baseline is zero', () => {
    expect(kpiDelta(3, 0, false)).toMatchObject({ value: '+3', direction: 'up', sentiment: 'positive' })
  })
})
