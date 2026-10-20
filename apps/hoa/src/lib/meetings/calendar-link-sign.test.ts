import { describe, expect, it } from 'vitest'
import { signCalendarLink, verifyCalendarLink } from './calendar-link-sign'

// L-3. Synthetic ids and secrets only.
const S = 'secret-1'
const base = { orgId: 'org-1', meetingId: '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40', start: '19:00', where: 'Clubhouse' }

describe('calendar link signature', () => {
  it('verifies exactly what was signed', () => {
    const sig = signCalendarLink(S, base)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyCalendarLink(S, { ...base, sig })).toBe(true)
    // Case of the ids does not matter.
    expect(verifyCalendarLink(S, { ...base, meetingId: base.meetingId.toUpperCase(), sig })).toBe(true)
  })

  it.each([
    ['place', { where: 'Evil Lane' }],
    ['time', { start: '03:00' }],
    ['place dropped', { where: null }],
    ['meeting', { meetingId: '11111111-1111-4111-8111-111111111111' }],
    ['org', { orgId: 'org-2' }],
  ])('refuses a changed %s', (_l, change) => {
    const sig = signCalendarLink(S, base)
    expect(verifyCalendarLink(S, { ...base, ...change, sig })).toBe(false)
  })

  it('refuses a missing, malformed or wrong-secret signature, and no secret at all', () => {
    const sig = signCalendarLink(S, base)
    expect(verifyCalendarLink(S, { ...base, sig: null })).toBe(false)
    expect(verifyCalendarLink(S, { ...base, sig: 'zz' })).toBe(false)
    expect(verifyCalendarLink(S, { ...base, sig: sig.toUpperCase() })).toBe(false)
    expect(verifyCalendarLink('other', { ...base, sig })).toBe(false)
    expect(verifyCalendarLink(null, { ...base, sig })).toBe(false)
  })
})
