import { describe, expect, it } from 'vitest'
import { inviteHref, inviteSecret, isAlreadyRegistered, signInvite, verifyInvite } from './invite-token'

const SECRET = 's'.repeat(40)
const ID = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('verifyInvite', () => {
  it('accepts the signature it issued', () => {
    expect(verifyInvite(ID, signInvite(ID, SECRET), SECRET)).toBe(true)
  })
  it('refuses a missing, empty, malformed or truncated signature', () => {
    for (const sig of [undefined, null, '', 'nope', 'z'.repeat(64), signInvite(ID, SECRET).slice(0, 62), signInvite(ID, SECRET) + '00']) {
      expect(verifyInvite(ID, sig, SECRET), String(sig)).toBe(false)
    }
  })
  it('refuses a signature for another invitation or another key', () => {
    expect(verifyInvite(OTHER, signInvite(ID, SECRET), SECRET)).toBe(false)
    expect(verifyInvite(ID, signInvite(ID, 'k'.repeat(40)), SECRET)).toBe(false)
  })
  it('is not the same signature as any other signed record (domain separated)', () => {
    expect(signInvite(ID, SECRET)).not.toBe(signInvite(OTHER, SECRET))
  })
  it('builds the accept path', () => {
    expect(inviteHref(ID, SECRET)).toBe(`/pro-invite/${ID}?sig=${signInvite(ID, SECRET)}`)
  })
})

describe('inviteSecret', () => {
  it('uses PRO_INVITE_SECRET when it is long enough', () => {
    expect(inviteSecret({ PRO_INVITE_SECRET: SECRET, NODE_ENV: 'production' })).toBe(SECRET)
  })
  it('fails closed in production: no fallback to the service role or the pay secret', () => {
    expect(inviteSecret({ NODE_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'srk', PAY_SETTINGS_SECRET: 'pay' })).toBeNull()
    expect(inviteSecret({ NODE_ENV: 'production', PRO_INVITE_SECRET: 'too-short' })).toBeNull()
  })
  it('falls back outside production so local runs need no setup', () => {
    expect(inviteSecret({ NODE_ENV: 'development', SUPABASE_SERVICE_ROLE_KEY: 'srk' })).toBe('srk')
    expect(inviteSecret({ NODE_ENV: 'test' })).toBeNull()
  })
})

describe('isAlreadyRegistered', () => {
  it('recognises only the already-registered answer', () => {
    expect(isAlreadyRegistered({ code: 'email_exists' })).toBe(true)
    expect(isAlreadyRegistered({ message: 'A user with this email address has already been registered' })).toBe(true)
    expect(isAlreadyRegistered({ message: 'Email rate limit exceeded' })).toBe(false)
    expect(isAlreadyRegistered({ code: 'over_email_send_rate_limit' })).toBe(false)
    expect(isAlreadyRegistered(null)).toBe(false)
  })
})
