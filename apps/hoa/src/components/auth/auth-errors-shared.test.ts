import { describe, expect, it } from 'vitest'
import { classifyAuthError, friendlyAuthError, SUPPORT_EMAIL } from './auth-errors-shared'

describe('friendlyAuthError', () => {
  it.each([
    [{ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 }, 'invalid-credentials'],
    [{ message: 'Invalid login credentials' }, 'invalid-credentials'],
    [{ message: 'User already registered', status: 422 }, 'already-registered'],
    [{ message: 'x', code: 'user_already_exists' }, 'already-registered'],
    [{ message: 'email rate limit exceeded', status: 429 }, 'rate-limit'],
    [{ message: 'For security purposes, you can only request this after 52 seconds.' }, 'rate-limit'],
    [{ message: 'Email not confirmed', code: 'email_not_confirmed' }, 'email-not-confirmed'],
    [{ message: 'Failed to fetch' }, 'network'],
    [{ message: 'database exploded: pg_xyz' }, 'other'],
    [null, 'other'],
  ] as const)('classifies %j as %s', (err, kind) => {
    expect(classifyAuthError(err)).toBe(kind)
  })

  it('says what to do next for a wrong password', () => {
    const m = friendlyAuthError({ message: 'Invalid login credentials' })
    expect(m).toContain('doesn’t match')
    expect(m).toContain('Email me a link')
    expect(m).toContain('reset your password')
  })

  it('never returns the raw provider text', () => {
    for (const raw of ['Invalid login credentials', 'User already registered', 'Email not confirmed', 'weird_internal_code 42']) {
      expect(friendlyAuthError({ message: raw })).not.toContain(raw)
    }
  })

  it('points the generic fallback at support', () => {
    expect(friendlyAuthError({ message: 'weird_internal_code 42' })).toContain(SUPPORT_EMAIL)
  })

  it('writes no em dashes', () => {
    for (const m of ['Invalid login credentials', 'User already registered', 'rate limit', 'Email not confirmed', 'Failed to fetch', 'zzz']) {
      expect(friendlyAuthError({ message: m })).not.toContain('—')
    }
  })
})
