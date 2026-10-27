import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next-path'

// BL-175a H6: the login ?redirect= goes through this before it is used.
describe('safeNextPath', () => {
  it.each(['javascript:alert(1)', '//evil.com', 'https://evil.com', '/\\evil.com', '', null])(
    'maps %s to /',
    (v) => {
      expect(safeNextPath(v)).toBe('/')
    },
  )

  it('keeps a same-site path with a query', () => {
    expect(safeNextPath('/dues?tab=a')).toBe('/dues?tab=a')
  })
})
