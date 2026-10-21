import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CLAIM_MESSAGES,
  CLAIM_SENT,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  formatJoinCode,
  joinCard,
  normaliseAddress,
  normaliseCode,
  normaliseUnit,
  normaliseZip,
  ownerEmailCheck,
  parseClaim,
  readClaimOutcome,
  readDecideOutcome,
  readJoinStatus,
} from './model'

// BL-143 (migration 0069 part 3). The address rules here mirror the SQL
// functions owner_join_norm_* that do the real matching; the parity test
// reads the migration so the two can't drift apart silently.

const here = path.dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(path.resolve(here, '../../../../../migrations/0069_m5_batch.sql'), 'utf8')

describe('normalisation', () => {
  it('treats spelling, case and punctuation variants of one address as equal', () => {
    expect(normaliseAddress('12 Oak Street')).toBe('12 oak st')
    expect(normaliseAddress('  12  OAK st. ')).toBe('12 oak st')
    expect(normaliseAddress('400 North Peachtree Avenue NE')).toBe('400 n peachtree ave ne')
    expect(normaliseAddress('')).toBe('')
    expect(normaliseAddress(null)).toBe('')
  })

  it('reduces a unit to its letters and digits', () => {
    expect(normaliseUnit('Apt #4B')).toBe('4b')
    expect(normaliseUnit('Unit 12')).toBe('12')
    expect(normaliseUnit('Suite 300')).toBe('300')
    expect(normaliseUnit(undefined)).toBe('')
  })

  it('keeps the first five digits of a ZIP and the letters and digits of a code', () => {
    expect(normaliseZip('30301-1234')).toBe('30301')
    expect(normaliseZip('3030')).toBe('3030')
    expect(normaliseCode(' abcde-fghjk ')).toBe('ABCDEFGHJK')
  })

  it('uses the same street words as owner_join_norm_address in 0069', () => {
    const pairs = [...sql.matchAll(/WHEN '([a-z]+)' THEN '([a-z]+)'/g)].map((m) => [m[1]!, m[2]!] as const)
    expect(pairs.length).toBeGreaterThan(20)
    for (const [from, to] of pairs) expect(normaliseAddress(`1 ${from}`), from).toBe(`1 ${to}`)
  })
})

describe('formatJoinCode', () => {
  it('makes a 10-symbol code from the no-look-alike alphabet, shown as two groups', () => {
    const code = formatJoinCode(Array.from({ length: JOIN_CODE_LENGTH }, (_, i) => i * 37))
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/)
    expect(normaliseCode(code)).toHaveLength(JOIN_CODE_LENGTH)
    expect(JOIN_CODE_ALPHABET).toHaveLength(32)
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[01IO]/)
  })

  it('refuses too few random bytes rather than make a short code', () => {
    expect(() => formatJoinCode([1, 2, 3])).toThrow()
  })
})

describe('parseClaim', () => {
  it('accepts an address with a ZIP, unit optional', () => {
    expect(parseClaim({ method: 'address', address: '12 Oak Street', postalCode: '30301-1234' })).toEqual({
      ok: true,
      claim: { kind: 'address', address: '12 Oak Street', postalCode: '30301', unit: '' },
    })
  })

  it('names each missing or wrong field', () => {
    const r = parseClaim({ method: 'address', address: ' ', postalCode: '123', unit: 'x'.repeat(41) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['address', 'postalCode', 'unit'])
  })

  it('accepts a 10-character code in any case and with dashes', () => {
    expect(parseClaim({ method: 'code', code: 'abcde-fghjk' })).toEqual({ ok: true, claim: { kind: 'code', code: 'ABCDEFGHJK' } })
    expect(parseClaim({ method: 'code', code: 'ABC' }).ok).toBe(false)
  })

  it('refuses anything that is not a claim', () => {
    expect(parseClaim(null).ok).toBe(false)
    expect(parseClaim({ method: 'nope' } as never).ok).toBe(false)
  })
})

describe('what the asker is told', () => {
  it('a sent claim never says whether the address was found', () => {
    expect(CLAIM_SENT).not.toMatch(/found|exists|match(ed)? a home|no home|not found/i)
    expect(CLAIM_SENT).toMatch(/if that matches/i)
  })

  it('reads only the outcomes the database can answer', () => {
    for (const v of ['sent', 'invalid_code', 'invalid', 'rate_limited']) expect(readClaimOutcome(v)).toBe(v)
    expect(readClaimOutcome('matched')).toBeNull()
    expect(Object.keys(CLAIM_MESSAGES).sort()).toEqual(['invalid', 'invalid_code', 'rate_limited'])
    expect(readDecideOutcome('approved')).toBe('approved')
    expect(readDecideOutcome('ok')).toBeNull()
  })

  it('reads the status row (array or object), or null', () => {
    expect(readJoinStatus([{ attempts_today: 2, daily_limit: 5, last_attempt_at: '2026-10-21T10:00:00Z' }])).toEqual({
      attemptsToday: 2,
      dailyLimit: 5,
      lastAttemptAt: '2026-10-21T10:00:00Z',
    })
    expect(readJoinStatus({ attempts_today: 0, daily_limit: 5, last_attempt_at: null })?.lastAttemptAt).toBeNull()
    expect(readJoinStatus(null)).toBeNull()
    expect(readJoinStatus([{ attempts_today: 'x' }])).toBeNull()
  })
})

describe('the board’s card', () => {
  const row = {
    id: 'r1',
    unit_id: 'u1',
    requester_name: 'Pat Owner',
    requester_email: 'pat@example.test',
    method: 'address',
    created_at: '2026-10-21T10:00:00Z',
  }
  const unit = { id: 'u1', address_line1: '12 Oak St', unit_number: '4B', city: 'Atlanta' }

  it('says who is asking, for which home, and how', () => {
    expect(joinCard(row, unit, [])).toEqual({
      requestId: 'r1',
      home: '12 Oak St, Unit 4B, Atlanta',
      who: 'Pat Owner (pat@example.test)',
      method: 'address',
      emailCheck: 'none',
    })
    expect(joinCard({ ...row, requester_name: null, method: 'code' }, undefined, []).who).toBe('pat@example.test')
    expect(joinCard({ ...row, requester_name: null, method: 'code' }, undefined, []).home).toBeNull()
  })

  it('checks the sign-in email against this home’s owners only, ignoring case', () => {
    const owners = [
      { unit_id: 'u1', owner_email: 'PAT@example.test', owner_user_id: null },
      { unit_id: 'u2', owner_email: 'other@example.test', owner_user_id: null },
    ]
    expect(joinCard(row, unit, owners).emailCheck).toBe('match')
    expect(joinCard({ ...row, unit_id: 'u2' }, unit, owners).emailCheck).toBe('other')
    expect(ownerEmailCheck(null, owners)).toBe('other')
    expect(ownerEmailCheck('pat@example.test', [])).toBe('none')
  })
})
