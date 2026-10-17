import { describe, expect, it } from 'vitest'
import { returnToParam, safeReturnPath } from './auth-redirect'

describe('returnToParam', () => {
  it('keeps the query string, so a bounced deep link lands on the same view', () => {
    expect(returnToParam('/properties', '?filter=attention&q=Oak')).toBe('/properties?filter=attention&q=Oak')
    expect(returnToParam('/properties/abc', '?tab=violations')).toBe('/properties/abc?tab=violations')
  })

  it('is null for the bare root (nothing to return to)', () => {
    expect(returnToParam('/', '')).toBeNull()
  })

  it('keeps a query on the root', () => {
    expect(returnToParam('/', '?org=1')).toBe('/?org=1')
  })
})

describe('safeReturnPath', () => {
  it('accepts a same-origin path with a query', () => {
    expect(safeReturnPath('/violations?property=p1')).toBe('/violations?property=p1')
  })

  it('refuses anything that could leave the origin', () => {
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'evil', '']) {
      expect(safeReturnPath(bad)).toBe('/')
    }
    expect(safeReturnPath(null)).toBe('/')
  })
})
