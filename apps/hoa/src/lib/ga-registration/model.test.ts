import { describe, expect, it } from 'vitest'
import {
  EMPTY_GA_REGISTRATION,
  amendmentFor,
  applyGaRegistrationEdit,
  coveredThrough,
  defaultCoversYear,
  gaGateBlocks,
  gaRegistrationStanding,
  isGaRegistrationRecord,
  parseConfirmation,
  parseDetail,
  type GaFiling,
  type GaRegistrationRecord,
} from './model'

// BL-149: the registration record's rules — what "registered" means on a
// given day, the Dec 31 expiry, the opt-out, and the edits the kit makes.

const MEETING = 'b0000000-0000-4000-8000-000000000001'
const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const reg = (filedOn: string, coversYear: number, n = 1): GaFiling => ({
  id: id(n),
  kind: 'registration',
  filedOn,
  confirmation: 'GA-123',
  coversYear,
  reason: null,
  meetingId: null,
})
const renewal = (filedOn: string, coversYear: number, n = 2): GaFiling => ({ ...reg(filedOn, coversYear, n), kind: 'renewal' })
const amendment = (filedOn: string, meetingId: string | null, n = 3): GaFiling => ({
  id: id(n),
  kind: 'amendment',
  filedOn,
  confirmation: null,
  coversYear: null,
  reason: 'officers',
  meetingId,
})
const record = (over: Partial<GaRegistrationRecord> = {}): GaRegistrationRecord => ({ ...EMPTY_GA_REGISTRATION, filings: [], noChange: [], ...over })
const saved = (r: GaRegistrationRecord) => ({ state: 'saved' as const, record: r })

describe('gaRegistrationStanding', () => {
  it('nothing recorded is not registered', () => {
    expect(gaRegistrationStanding({ state: 'none', record: record() }, '2027-02-01').status).toBe('not_registered')
  })

  it('an unverified record never counts as registered', () => {
    expect(gaRegistrationStanding({ state: 'unverified', record: record({ filings: [reg('2027-01-05', 2027)] }) }, '2027-02-01').status).toBe(
      'unverified',
    )
  })

  it('a 2027 registration is current through Dec 31, 2027 and lapses on Jan 1, 2028', () => {
    const r = saved(record({ decision: 'register', filings: [reg('2027-01-05', 2027)] }))
    expect(gaRegistrationStanding(r, '2027-12-31')).toEqual({ status: 'registered', registeredOn: '2027-01-05', coveredThrough: '2027-12-31' })
    expect(gaRegistrationStanding(r, '2028-01-01').status).toBe('lapsed')
  })

  it('a renewal for 2028 carries it through Dec 31, 2028', () => {
    const r = saved(record({ filings: [reg('2027-01-05', 2027), renewal('2027-12-01', 2028)] }))
    expect(gaRegistrationStanding(r, '2028-06-30')).toMatchObject({ status: 'registered', coveredThrough: '2028-12-31' })
  })

  it('an amendment alone registers nothing', () => {
    expect(gaRegistrationStanding(saved(record({ filings: [amendment('2027-03-01', null)] })), '2027-04-01').status).toBe('not_registered')
  })

  it('a recorded opt-out wins, even with filings on record', () => {
    expect(gaRegistrationStanding(saved(record({ decision: 'opt_out', filings: [reg('2027-01-05', 2027)] })), '2027-02-01').status).toBe(
      'opted_out',
    )
  })
})

describe('coveredThrough and defaultCoversYear', () => {
  it('takes the latest year covered', () => {
    expect(coveredThrough([reg('2027-01-05', 2027), renewal('2027-11-01', 2028)])).toBe('2028-12-31')
    expect(coveredThrough([])).toBeNull()
  })

  it('a first registration covers its own year, never before 2027', () => {
    expect(defaultCoversYear('registration', '2026-12-20')).toBe(2027)
    expect(defaultCoversYear('registration', '2028-03-01')).toBe(2028)
  })

  it('a renewal filed in the second half of the year renews the next one; a late one renews its own', () => {
    expect(defaultCoversYear('renewal', '2027-11-15')).toBe(2028)
    expect(defaultCoversYear('renewal', '2028-01-10')).toBe(2028)
  })
})

describe('the gate date', () => {
  it('blocks from Jan 1, 2027 (SB 406 § 9(a)), warns before', () => {
    expect(gaGateBlocks('2026-12-31')).toBe(false)
    expect(gaGateBlocks('2027-01-01')).toBe(true)
  })
})

describe('applyGaRegistrationEdit', () => {
  it('recording a registration sets the decision to register', () => {
    const r = applyGaRegistrationEdit(record({ decision: 'opt_out', decidedOn: '2026-11-01' }), { op: 'add_filing', filing: reg('2027-01-05', 2027) })
    expect(r.ok && r.record.decision).toBe('register')
    expect(r.ok && r.record.decidedOn).toBe('2027-01-05')
  })

  it('an amendment for an election answers its BL-151 row, once', () => {
    const r = applyGaRegistrationEdit(record({ noChange: [MEETING] }), { op: 'add_filing', filing: amendment('2027-03-01', MEETING) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.record.noChange).toEqual([])
    expect(amendmentFor(r.record, MEETING)).toMatchObject({ kind: 'filed' })
    const again = applyGaRegistrationEdit(r.record, { op: 'add_filing', filing: amendment('2027-03-02', MEETING, 4) })
    expect(again.ok).toBe(false)
  })

  it('"officers didn’t change" answers the row, and can be undone', () => {
    const r = applyGaRegistrationEdit(record(), { op: 'no_change', meetingId: MEETING })
    expect(r.ok && amendmentFor(r.record, MEETING)).toEqual({ kind: 'no_change' })
    const undone = r.ok ? applyGaRegistrationEdit(r.record, { op: 'undo_no_change', meetingId: MEETING }) : r
    expect(undone.ok && amendmentFor(undone.record, MEETING)).toBeNull()
  })

  it('removes a filing by id and refuses an unknown one', () => {
    const r = applyGaRegistrationEdit(record({ filings: [reg('2027-01-05', 2027)] }), { op: 'remove_filing', filingId: id(1) })
    expect(r.ok && r.record.filings).toEqual([])
    expect(applyGaRegistrationEdit(record(), { op: 'remove_filing', filingId: id(9) }).ok).toBe(false)
  })

  it('refuses a malformed filing', () => {
    const bad = { ...reg('2027-01-05', 2026) }
    expect(applyGaRegistrationEdit(record(), { op: 'add_filing', filing: bad }).ok).toBe(false)
    const badAmendment = { ...amendment('2027-03-01', null), coversYear: 2027 }
    expect(applyGaRegistrationEdit(record(), { op: 'add_filing', filing: badAmendment }).ok).toBe(false)
  })
})

describe('validation', () => {
  it('confirmation numbers: letters, digits and filing punctuation only', () => {
    expect(parseConfirmation('  GA-2027/00123 ')).toBe('GA-2027/00123')
    expect(parseConfirmation('')).toBeNull()
    expect(parseConfirmation('<script>')).toBe(false)
    expect(parseConfirmation('x'.repeat(65))).toBe(false)
  })

  it('detail lines are one line, up to 200 characters', () => {
    expect(parseDetail(' 1 Main St,\n Atlanta ')).toBe('1 Main St, Atlanta')
    expect(parseDetail('x'.repeat(201))).toBe(false)
  })

  it('a record with duplicate filing ids is not a record', () => {
    expect(isGaRegistrationRecord(record({ filings: [reg('2027-01-05', 2027), reg('2027-01-06', 2027)] }))).toBe(false)
    expect(isGaRegistrationRecord(record({ filings: [reg('2027-01-05', 2027)] }))).toBe(true)
  })
})
