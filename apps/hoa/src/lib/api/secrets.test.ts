import { afterEach, describe, expect, it } from 'vitest'
import { ApiRouteError } from './errors'
import { bearerToken, requireBearerSecret, secretMatches } from './secrets'

const withAuth = (value?: string, url = 'http://x/api/cron/thing') =>
  new Request(url, { headers: value === undefined ? {} : { authorization: value } })

afterEach(() => {
  delete process.env.TEST_ROUTE_SECRET
})

describe('bearerToken', () => {
  it('reads Authorization: Bearer only', () => {
    expect(bearerToken(withAuth('Bearer abc'))).toBe('abc')
    expect(bearerToken(withAuth('bearer abc'))).toBe('abc')
    expect(bearerToken(withAuth('Basic abc'))).toBeNull()
    expect(bearerToken(withAuth())).toBeNull()
  })

  it('ignores a ?key= query secret', () => {
    expect(bearerToken(withAuth(undefined, 'http://x/api/cron/thing?key=abc'))).toBeNull()
  })
})

describe('secretMatches', () => {
  it('compares in constant time and handles different lengths', () => {
    expect(secretMatches('abc', 'abc')).toBe(true)
    expect(secretMatches('abc', 'abd')).toBe(false)
    expect(secretMatches('abc', 'abcd')).toBe(false)
    expect(secretMatches(null, 'abc')).toBe(false)
    expect(secretMatches('', '')).toBe(false)
  })
})

describe('requireBearerSecret', () => {
  it('throws 503 not_configured when the secret is unset (fails closed)', () => {
    try {
      requireBearerSecret(withAuth('Bearer anything'), 'TEST_ROUTE_SECRET')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiRouteError)
      expect((e as ApiRouteError).code).toBe('not_configured')
    }
  })

  it('throws 401 unauthenticated on a wrong or missing bearer', () => {
    process.env.TEST_ROUTE_SECRET = 's3cret'
    for (const r of [withAuth('Bearer nope'), withAuth(), withAuth(undefined, 'http://x/?key=s3cret')]) {
      expect(() => requireBearerSecret(r, 'TEST_ROUTE_SECRET')).toThrow(
        expect.objectContaining({ code: 'unauthenticated' }),
      )
    }
  })

  it('passes with the right bearer', () => {
    process.env.TEST_ROUTE_SECRET = 's3cret'
    expect(() => requireBearerSecret(withAuth('Bearer s3cret'), 'TEST_ROUTE_SECRET')).not.toThrow()
  })
})
