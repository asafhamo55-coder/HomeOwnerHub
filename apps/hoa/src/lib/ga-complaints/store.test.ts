import { describe, expect, it } from 'vitest'
import { GA_COMPLAINTS_KEY, type GaComplaintsRecord } from './model'
import { readGaComplaints, signGaComplaints, withGaComplaints } from './store'

// BL-161: only a record the board's server action signed is trusted. A
// forged or edited record reads "unverified", which the gate treats as a
// stay that can't be ruled out (fail closed).

const ASSOC = 'assoc-1'
const UNIT = 'a0000000-0000-4000-8000-000000000001'
const SECRET = 'test-secret'
const record: GaComplaintsRecord = {
  units: { [UNIT]: [{ id: 'c0000000-0000-4000-8000-000000000001', filedOn: '2027-02-01', subject: 'fines', conclusionsOn: null, extended: false }] },
}
const stamp = { updatedAt: '2027-02-02T12:00:00.000Z', updatedBy: 'user-1' }

describe('signed complaint record', () => {
  it('round-trips and keeps every other settings key', () => {
    const settings = withGaComplaints({ late_fee_policy: { kept: true } }, signGaComplaints(ASSOC, record, stamp, SECRET))
    expect(settings.late_fee_policy).toEqual({ kept: true })
    expect(readGaComplaints(ASSOC, settings, SECRET)).toEqual({ state: 'saved', record, updatedAt: stamp.updatedAt })
  })

  it('nothing stored reads as none', () => {
    expect(readGaComplaints(ASSOC, {}, SECRET).state).toBe('none')
  })

  it('a tampered, forged, re-homed or secretless record is unverified', () => {
    const stored = signGaComplaints(ASSOC, record, stamp, SECRET)
    const edited = { ...stored, record: { units: {} } }
    expect(readGaComplaints(ASSOC, { [GA_COMPLAINTS_KEY]: edited }, SECRET).state).toBe('unverified')
    expect(readGaComplaints(ASSOC, { [GA_COMPLAINTS_KEY]: { ...stored, sig: 'f00d' } }, SECRET).state).toBe('unverified')
    expect(readGaComplaints('assoc-2', { [GA_COMPLAINTS_KEY]: stored }, SECRET).state).toBe('unverified')
    expect(readGaComplaints(ASSOC, { [GA_COMPLAINTS_KEY]: stored }, null).state).toBe('unverified')
  })

  it('refuses to sign an invalid record', () => {
    expect(() => signGaComplaints(ASSOC, { units: { nope: [] } } as never, stamp, SECRET)).toThrow(RangeError)
  })
})
