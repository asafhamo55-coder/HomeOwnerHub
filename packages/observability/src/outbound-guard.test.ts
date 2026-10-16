import { describe, expect, it, vi } from 'vitest'
import {
  OUTBOUND_BLOCKED_ERROR,
  fetchOrgSandbox,
  guardRecipients,
  isAllowlisted,
  isOrgSandbox,
  parseAllowlist,
  resolveOutboundPolicy,
} from './outbound-guard'

/**
 * BL-004. The failure this module exists to prevent is a guard that
 * silently allows a send, so most cases here are "a resident is blocked".
 */

const RESIDENT = 'resident@gmail.com'
const PREVIEW = { VERCEL_ENV: 'preview', OUTBOUND_ALLOWLIST: 'owner@example.com,@example.test' }
const LOCAL = { OUTBOUND_ALLOWLIST: 'owner@example.com' } // no VERCEL_ENV at all
const PROD = { VERCEL_ENV: 'production' }

function quietLogger() {
  return { warn: vi.fn() }
}

describe('resolveOutboundPolicy', () => {
  it('enforces the allowlist in preview', () => {
    expect(resolveOutboundPolicy({ env: PREVIEW }).enforce).toBe(true)
  })

  it('enforces the allowlist locally and in tests, where VERCEL_ENV is unset', () => {
    expect(resolveOutboundPolicy({ env: {} }).enforce).toBe(true)
    expect(resolveOutboundPolicy({ env: { VERCEL_ENV: 'development' } }).enforce).toBe(true)
  })

  it('does not enforce in production', () => {
    expect(resolveOutboundPolicy({ env: PROD }).enforce).toBe(false)
  })

  it('enforces in production for an org in sandbox mode', () => {
    const policy = resolveOutboundPolicy({ env: PROD, orgSandbox: true })
    expect(policy.enforce).toBe(true)
    expect(policy.reason).toBe('org_sandbox')
  })

  it('treats a near-miss like "Production" as non-production (fail closed)', () => {
    expect(resolveOutboundPolicy({ env: { VERCEL_ENV: 'Production' } }).enforce).toBe(true)
  })
})

describe('allowlist matching', () => {
  const list = parseAllowlist(
    ' Owner@Example.com , @example.test, staging.dev, +1 (404) 555-1234, user:abc-123 ,, ',
  )

  it('matches an exact email, case-insensitively', () => {
    expect(isAllowlisted('email', 'owner@example.com', list)).toBe(true)
    expect(isAllowlisted('email', 'OWNER@EXAMPLE.COM', list)).toBe(true)
  })

  it('matches every address at an @domain entry', () => {
    expect(isAllowlisted('email', 'anyone@example.test', list)).toBe(true)
  })

  it('matches every address at a bare-domain entry', () => {
    expect(isAllowlisted('email', 'qa@staging.dev', list)).toBe(true)
  })

  it('does not match a subdomain or a lookalike domain', () => {
    expect(isAllowlisted('email', 'x@mail.example.test', list)).toBe(false)
    expect(isAllowlisted('email', 'x@example.test.evil.com', list)).toBe(false)
    expect(isAllowlisted('email', 'x@notexample.test', list)).toBe(false)
  })

  it('does not match a different address at the exact-email domain', () => {
    expect(isAllowlisted('email', 'someone-else@example.com', list)).toBe(false)
  })

  it('handles display-name and angle-bracket forms', () => {
    expect(isAllowlisted('email', 'Owner <owner@example.com>', list)).toBe(true)
    expect(isAllowlisted('email', 'Resident <resident@gmail.com>', list)).toBe(false)
  })

  it('matches phones by digits, regardless of formatting or a US leading 1', () => {
    expect(isAllowlisted('sms', '+14045551234', list)).toBe(true)
    expect(isAllowlisted('sms', '404-555-1234', list)).toBe(true)
    expect(isAllowlisted('sms', '+14045559999', list)).toBe(false)
  })

  it('matches push recipients only by an explicit user: entry', () => {
    expect(isAllowlisted('push', 'abc-123', list)).toBe(true)
    expect(isAllowlisted('push', 'def-456', list)).toBe(false)
  })

  it('an empty or missing allowlist allows nobody', () => {
    const empty = parseAllowlist(undefined)
    expect(isAllowlisted('email', RESIDENT, empty)).toBe(false)
    expect(isAllowlisted('sms', '+14045551234', parseAllowlist(''))).toBe(false)
  })

  it('a blank or malformed recipient is never allowed', () => {
    expect(isAllowlisted('email', '', list)).toBe(false)
    expect(isAllowlisted('email', '@example.test', list)).toBe(false)
    expect(isAllowlisted('sms', '', list)).toBe(false)
  })
})

describe('guardRecipients', () => {
  it('outside production, drops a resident and keeps an allowlisted address', () => {
    const logger = quietLogger()
    const result = guardRecipients('email', [RESIDENT, 'owner@example.com'], (r) => r, {
      env: PREVIEW,
      logger,
    })
    expect(result.allowed).toEqual(['owner@example.com'])
    expect(result.blocked).toEqual([RESIDENT])
  })

  it('locally (no VERCEL_ENV) a resident is blocked', () => {
    const result = guardRecipients('email', [RESIDENT], (r) => r, {
      env: LOCAL,
      logger: quietLogger(),
    })
    expect(result.allowed).toEqual([])
    expect(result.blocked).toEqual([RESIDENT])
  })

  it('in production delivers everyone, allowlist or not', () => {
    const logger = quietLogger()
    const result = guardRecipients('email', [RESIDENT, 'x@y.z'], (r) => r, { env: PROD, logger })
    expect(result.allowed).toEqual([RESIDENT, 'x@y.z'])
    expect(result.blocked).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('in production, an org in sandbox mode blocks a resident', () => {
    const result = guardRecipients('sms', ['+15551230000'], (r) => r, {
      env: { ...PROD, OUTBOUND_ALLOWLIST: '+14045551234' },
      orgSandbox: true,
      logger: quietLogger(),
    })
    expect(result.allowed).toEqual([])
  })

  it('works on objects through the recipient accessor and keeps positions', () => {
    const rows = [
      { id: 'r1', email: RESIDENT },
      { id: 'r2', email: 'a@example.test' },
      { id: 'r3', email: null },
    ]
    const result = guardRecipients('email', rows, (r) => r.email, {
      env: PREVIEW,
      logger: quietLogger(),
    })
    expect(result.allowed.map((r) => r.id)).toEqual(['r2'])
    expect(result.blocked.map((r) => r.id)).toEqual(['r1', 'r3'])
    expect(result.allowedMask).toEqual([false, true, false])
  })

  it('logs counts, channel and ref only — never an address', () => {
    const logger = quietLogger()
    guardRecipients('email', [RESIDENT, 'other.resident@yahoo.com'], (r) => r, {
      env: PREVIEW,
      ref: 'comm-42',
      logger,
    })
    expect(logger.warn).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(logger.warn.mock.calls[0])
    expect(logged).toContain('comm-42')
    expect(logged).toContain('"blocked":2')
    expect(logged).not.toContain('resident')
    expect(logged).not.toContain('@')
  })

  it('does not log when nothing was blocked', () => {
    const logger = quietLogger()
    guardRecipients('email', ['owner@example.com'], (r) => r, { env: PREVIEW, logger })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('exposes a stable error string for blocked sends', () => {
    expect(OUTBOUND_BLOCKED_ERROR).toMatch(/outbound safety guard/i)
    expect(OUTBOUND_BLOCKED_ERROR).not.toContain('@')
  })
})

describe('org sandbox flag', () => {
  it('reads compliance_settings.outbound_mode', () => {
    expect(isOrgSandbox({ outbound_mode: 'sandbox' })).toBe(true)
    expect(isOrgSandbox({ outbound_mode: 'live' })).toBe(false)
    expect(isOrgSandbox({})).toBe(false)
    expect(isOrgSandbox(null)).toBe(false)
    expect(isOrgSandbox('sandbox')).toBe(false)
  })

  function dbReturning(result: { data: unknown; error: unknown }) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return { from: vi.fn(() => chain) }
  }

  it('is sandboxed when any association of the org is', async () => {
    const db = dbReturning({
      data: [{ compliance_settings: {} }, { compliance_settings: { outbound_mode: 'sandbox' } }],
      error: null,
    })
    expect(await fetchOrgSandbox(db, 'org-1')).toBe(true)
    expect(db.from).toHaveBeenCalledWith('associations')
  })

  it('is live when no association asks for sandbox', async () => {
    const db = dbReturning({ data: [{ compliance_settings: { outbound_mode: 'live' } }], error: null })
    expect(await fetchOrgSandbox(db, 'org-1')).toBe(false)
  })

  it('fails closed: a lookup error means sandbox', async () => {
    const db = dbReturning({ data: null, error: { message: 'boom' } })
    expect(await fetchOrgSandbox(db, 'org-1', quietLogger())).toBe(true)
  })

  it('fails closed: a thrown lookup means sandbox', async () => {
    const db = {
      from: vi.fn(() => {
        throw new Error('network')
      }),
    }
    expect(await fetchOrgSandbox(db, 'org-1', quietLogger())).toBe(true)
  })
})
