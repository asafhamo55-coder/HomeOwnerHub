import { describe, expect, it } from 'vitest'
import { safeNextPath, signupNextPath } from './safe-next-path'

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

describe('signupNextPath', () => {
  it('keeps a same-site path such as /join', () => {
    expect(signupNextPath('/join')).toBe('/join')
    expect(signupNextPath('/loginhelp')).toBe('/loginhelp')
  })

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    '',
    null,
    undefined,
    '/%2F%2Fevil.com',
    '/\t/evil',
    ' /join',
    '/\\evil',
    '/',
    '/signup',
    '/signup?redirect=/join',
    '/login',
    '/login?redirect=/join',
    '/auth/callback',
  ])(
    'sends %s to /onboarding',
    (v) => {
      expect(signupNextPath(v)).toBe('/onboarding')
    },
  )
})
