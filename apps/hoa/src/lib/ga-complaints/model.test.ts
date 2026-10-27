import { describe, expect, it } from 'vitest'
import {
  EMPTY_GA_COMPLAINTS,
  addDays,
  applyGaComplaintEdit,
  cleanGaComplaints,
  complaintStayOn,
  gaComplaintStayBlocks,
  isGaComplaintsRecord,
  stayLastDay,
  stayRunsOn,
  stayedUnitsOn,
  type GaComplaint,
} from './model'

// BL-161: the § 43-17A-5(c) stay as HomeownerHub reads it. It runs from the
// filing day; it ends when the hearing officer renders conclusions (the
// last stayed day is the day before), or 15 days after them if extended.

const UNIT = 'a0000000-0000-4000-8000-000000000001'
const UNIT2 = 'a0000000-0000-4000-8000-000000000002'
const C1 = 'c0000000-0000-4000-8000-000000000001'
const C2 = 'c0000000-0000-4000-8000-000000000002'

const complaint = (over: Partial<GaComplaint> = {}): GaComplaint => ({ id: C1, filedOn: '2027-02-01', subject: 'both', conclusionsOn: null, extended: false, ...over })

describe('the stay', () => {
  it('runs from the filing day while no conclusions are recorded', () => {
    const c = complaint()
    expect(stayRunsOn(c, '2027-01-31')).toBe(false)
    expect(stayRunsOn(c, '2027-02-01')).toBe(true)
    expect(stayRunsOn(c, '2030-01-01')).toBe(true)
    expect(stayLastDay(c)).toBeNull()
  })

  it('expires upon the conclusions: the day before is the last stayed day', () => {
    const c = complaint({ conclusionsOn: '2027-04-10' })
    expect(stayLastDay(c)).toBe('2027-04-09')
    expect(stayRunsOn(c, '2027-04-09')).toBe(true)
    expect(stayRunsOn(c, '2027-04-10')).toBe(false)
  })

  it('extended: runs through the 15th day after the conclusions', () => {
    const c = complaint({ conclusionsOn: '2027-04-10', extended: true })
    expect(stayLastDay(c)).toBe('2027-04-25')
    expect(stayRunsOn(c, '2027-04-25')).toBe(true)
    expect(stayRunsOn(c, '2027-04-26')).toBe(false)
  })

  it('combines a unit’s complaints: earliest running filing, open-ended wins', () => {
    const gate = { verified: true, complaints: [complaint({ conclusionsOn: '2027-03-01' }), complaint({ id: C2, filedOn: '2027-02-15' })] }
    expect(complaintStayOn(gate, '2027-02-20')).toEqual({ kind: 'running', filedOn: '2027-02-01', lastDay: null })
    expect(complaintStayOn(gate, '2027-03-05')).toEqual({ kind: 'running', filedOn: '2027-02-15', lastDay: null })
    expect(complaintStayOn({ verified: true, complaints: [complaint({ conclusionsOn: '2027-03-01' })] }, '2027-03-01')).toEqual({ kind: 'none' })
  })

  it('an unverified record can’t rule a stay out', () => {
    expect(complaintStayOn({ verified: false, complaints: [] }, '2027-02-01')).toEqual({ kind: 'unverified' })
    expect(stayedUnitsOn({ state: 'unverified', record: EMPTY_GA_COMPLAINTS }, '2027-02-01')).toBe('all')
  })

  it('stayedUnitsOn lists only the units whose stay runs that day', () => {
    const record = { units: { [UNIT]: [complaint()], [UNIT2]: [complaint({ id: C2, conclusionsOn: '2027-02-05' })] } }
    expect([...(stayedUnitsOn({ state: 'saved', record }, '2027-03-01') as Set<string>)]).toEqual([UNIT])
  })

  it('blocks from Jan 1, 2027 only', () => {
    expect(gaComplaintStayBlocks('2026-12-31')).toBe(false)
    expect(gaComplaintStayBlocks('2027-01-01')).toBe(true)
  })

  it('addDays crosses months and years', () => {
    expect(addDays('2027-12-25', 15)).toBe('2028-01-09')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
  })
})

describe('the record', () => {
  it('rejects conclusions before the filing, an extension without conclusions, and non-uuid units', () => {
    expect(isGaComplaintsRecord({ units: { [UNIT]: [complaint({ conclusionsOn: '2027-01-01' })] } })).toBe(false)
    expect(isGaComplaintsRecord({ units: { [UNIT]: [complaint({ extended: true })] } })).toBe(false)
    expect(isGaComplaintsRecord({ units: { 'not-a-uuid': [complaint()] } })).toBe(false)
    expect(isGaComplaintsRecord({ units: { [UNIT]: [complaint()] } })).toBe(true)
  })

  it('cleans to a fixed order (jsonb reorders keys) and drops empty units', () => {
    const a = cleanGaComplaints({ units: { [UNIT2]: [complaint()], [UNIT]: [], 'b0000000-0000-4000-8000-000000000000': [complaint({ id: C2 })] } })
    expect(Object.keys(a.units)).toEqual(['a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000000'])
  })

  it('add, conclude, then remove', () => {
    const added = applyGaComplaintEdit(EMPTY_GA_COMPLAINTS, { op: 'add', unitId: UNIT, complaint: complaint() })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(applyGaComplaintEdit(added.record, { op: 'add', unitId: UNIT, complaint: complaint() })).toEqual({ ok: false, error: 'That complaint is already recorded.' })
    const done = applyGaComplaintEdit(added.record, { op: 'conclude', unitId: UNIT, complaintId: C1, conclusionsOn: '2027-04-10', extended: true })
    expect(done.ok && done.record.units[UNIT]![0]).toMatchObject({ conclusionsOn: '2027-04-10', extended: true })
    const early = applyGaComplaintEdit(added.record, { op: 'conclude', unitId: UNIT, complaintId: C1, conclusionsOn: '2027-01-15', extended: false })
    expect(early.ok).toBe(false)
    const cleared = applyGaComplaintEdit(done.ok ? done.record : added.record, { op: 'conclude', unitId: UNIT, complaintId: C1, conclusionsOn: null, extended: true })
    expect(cleared.ok && cleared.record.units[UNIT]![0]).toMatchObject({ conclusionsOn: null, extended: false })
    const removed = applyGaComplaintEdit(added.record, { op: 'remove', unitId: UNIT, complaintId: C1 })
    expect(removed).toEqual({ ok: true, record: { units: {} } })
    expect(applyGaComplaintEdit(added.record, { op: 'remove', unitId: UNIT2, complaintId: C1 }).ok).toBe(false)
  })
})
