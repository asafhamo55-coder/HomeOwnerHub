import { describe, expect, it } from 'vitest'
import { propertyCountLabel } from './count-label'

describe('propertyCountLabel', () => {
  const base = { filter: 'all' as const, total: 57, allCount: 57, search: '', searchMatches: null }

  it('the default view is the home count', () => {
    expect(propertyCountLabel(base)).toBe('57 homes')
  })

  it('a failed org count is unavailable, never 0', () => {
    expect(propertyCountLabel({ ...base, allCount: null, total: null })).toBe('home count unavailable')
  })

  it('names the subset beside the association size', () => {
    expect(propertyCountLabel({ ...base, filter: 'attention', total: 12 })).toBe('12 needing attention · 57 homes')
    expect(propertyCountLabel({ ...base, filter: 'incomplete', total: 1 })).toBe('1 incomplete record · 57 homes')
    expect(propertyCountLabel({ ...base, filter: 'leased', total: 9 })).toBe('9 leased · 57 homes')
    expect(propertyCountLabel({ ...base, filter: 'waiting', total: 2 })).toBe('2 on the waiting list · 57 homes')
  })

  it('a search reports its matches, and the filtered share of them', () => {
    expect(propertyCountLabel({ ...base, search: 'Oak', total: 3, searchMatches: 3 })).toBe('3 match “Oak” · 57 homes')
    expect(propertyCountLabel({ ...base, filter: 'attention', search: 'Oak', total: 1, searchMatches: 3 })).toBe(
      '1 needing attention of 3 matching “Oak” · 57 homes',
    )
    expect(propertyCountLabel({ ...base, search: 'Oak', total: 1, searchMatches: 1 })).toBe('1 matches “Oak” · 57 homes')
  })
})
