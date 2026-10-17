import { describe, expect, it } from 'vitest'
import { parsePropertyParam, withPropertyParam } from './property-scope'

const ID = '3f1c2b9a-1d2e-4f50-8a6b-0c1d2e3f4a5b'

describe('parsePropertyParam', () => {
  it('accepts a uuid, case-insensitively, trimmed', () => {
    expect(parsePropertyParam(ID)).toBe(ID)
    expect(parsePropertyParam(` ${ID.toUpperCase()} `)).toBe(ID)
  })
  it('ignores anything else, so a junk param never reaches a query', () => {
    for (const raw of [undefined, '', 'all', '1', `${ID},x`, "x' or 1=1"]) expect(parsePropertyParam(raw)).toBeNull()
  })
  it('takes the first of repeated params', () => {
    expect(parsePropertyParam([ID, 'x'])).toBe(ID)
  })
})

describe('withPropertyParam', () => {
  it('adds or keeps the scope on a list link', () => {
    expect(withPropertyParam('/violations?status=action', ID)).toBe(`/violations?status=action&property=${ID}`)
    expect(withPropertyParam('/violations', null)).toBe('/violations')
  })
})
