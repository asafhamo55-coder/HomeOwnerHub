import { describe, expect, it } from 'vitest'
import { EMPTY_GA_REGISTRATION, GA_REGISTRATION_KEY, type GaRegistrationRecord } from './model'
import { gaStandingOf, readGaRegistration, signGaRegistration, withGaRegistration } from './store'

// BL-149: only the board's signed save counts. Anything else — a forged
// "registered", a copy from another association, no secret — reads as
// unverified, which the gate treats as NOT registered.

const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const OTHER = 'a0000000-0000-4000-8000-000000000002'
const SECRET = 'test-secret'
const stamp = { updatedAt: '2027-01-05T15:00:00.000Z', updatedBy: 'user-1' }

const registered: GaRegistrationRecord = {
  ...EMPTY_GA_REGISTRATION,
  decision: 'register',
  decidedOn: '2027-01-05',
  filings: [
    {
      id: 'c0000000-0000-4000-8000-000000000001',
      kind: 'registration',
      filedOn: '2027-01-05',
      confirmation: 'GA-123',
      coversYear: 2027,
      reason: null,
      meetingId: null,
    },
  ],
  noChange: [],
}

describe('signGaRegistration / readGaRegistration', () => {
  it('round-trips, keeping every other settings key', () => {
    const settings = withGaRegistration({ late_fee_policy: { kept: true } }, signGaRegistration(ASSOC, registered, stamp, SECRET))
    expect(settings.late_fee_policy).toEqual({ kept: true })
    const read = readGaRegistration(ASSOC, settings, SECRET)
    expect(read.state).toBe('saved')
    expect(read.record).toEqual(registered)
    expect(gaStandingOf(ASSOC, settings, SECRET, '2027-02-01').status).toBe('registered')
  })

  it('nothing stored reads as none', () => {
    expect(readGaRegistration(ASSOC, {}, SECRET).state).toBe('none')
    expect(gaStandingOf(ASSOC, null, SECRET, '2027-02-01').status).toBe('not_registered')
  })

  it('a tampered record is unverified, and so not registered', () => {
    const stored = signGaRegistration(ASSOC, { ...registered, filings: [] }, stamp, SECRET)
    const forged = { ...stored, record: registered }
    const settings = { [GA_REGISTRATION_KEY]: forged }
    expect(readGaRegistration(ASSOC, settings, SECRET).state).toBe('unverified')
    expect(gaStandingOf(ASSOC, settings, SECRET, '2027-02-01').status).toBe('unverified')
  })

  it('a record signed for another association does not verify', () => {
    const settings = withGaRegistration({}, signGaRegistration(OTHER, registered, stamp, SECRET))
    expect(readGaRegistration(ASSOC, settings, SECRET).state).toBe('unverified')
  })

  it('without the server secret nothing verifies', () => {
    const settings = withGaRegistration({}, signGaRegistration(ASSOC, registered, stamp, SECRET))
    expect(readGaRegistration(ASSOC, settings, null).state).toBe('unverified')
    expect(readGaRegistration(ASSOC, settings, 'another-secret').state).toBe('unverified')
  })

  it('refuses to sign something that is not a record', () => {
    expect(() => signGaRegistration(ASSOC, { ...registered, decision: 'maybe' as never }, stamp, SECRET)).toThrow(RangeError)
  })
})
