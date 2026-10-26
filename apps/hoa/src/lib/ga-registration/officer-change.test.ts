import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_GA_REGISTRATION, GA_REGISTRATION_AUDIT_ACTION, MAX_OFFICER_CHANGES, amendmentFor, applyGaRegistrationEdit, boardSeatChanged, type GaRegistrationRecord } from './model'
import { readGaRegistration, signGaRegistration, withGaRegistration } from './store'
import { startGaOfficerChangeClock } from './officer-change'

// BL-159: a board role change in Settings → Members starts BL-151's 30-day
// amended-registration row for every Georgia association in the org, in the
// signed registration record. Non-GA associations are untouched; a record
// that doesn't verify is left alone; audit rows carry ids and codes only.

vi.mock('server-only', () => ({}))

const ORG = 'org-1'
const GA = 'a0000000-0000-4000-8000-000000000001'
const GA2 = 'a0000000-0000-4000-8000-000000000002'
const FL = 'a0000000-0000-4000-8000-000000000003'
const MEMBER = 'f0000000-0000-4000-8000-000000000001'
const ACTOR = 'f0000000-0000-4000-8000-000000000002'
const SECRET = 'test-secret'
const stamp = { updatedAt: '2027-01-01T00:00:00Z', updatedBy: null }

type Row = { id: string; state: string | null; governing_law_state: string | null; compliance_settings: unknown }

const h = { rows: [] as Row[], updates: [] as Array<{ id: unknown; settings: Record<string, unknown> }>, audit: [] as Array<Record<string, unknown>>, readError: false }

function fakeDb() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let update: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filters[c] = v), q),
        update: (v: Record<string, unknown>) => ((update = v), q),
        insert: (row: Record<string, unknown>) => {
          if (table === 'audit_log') h.audit.push(row)
          return Promise.resolve({ error: null })
        },
        then: (res: (v: unknown) => unknown) => {
          if (update) {
            const row = h.rows.find((r) => r.id === filters.id && filters.organization_id === ORG)
            if (!row) return Promise.resolve({ data: [], error: null }).then(res)
            row.compliance_settings = update.compliance_settings
            h.updates.push({ id: filters.id, settings: update.compliance_settings as Record<string, unknown> })
            return Promise.resolve({ data: [{ id: row.id }], error: null }).then(res)
          }
          if (h.readError) return Promise.resolve({ data: null, error: { code: '57014' } }).then(res)
          return Promise.resolve({ data: filters.organization_id === ORG ? h.rows : [], error: null }).then(res)
        },
      }
      return q
    },
  }
}

function signed(record: Partial<GaRegistrationRecord>, id = GA): Record<string, unknown> {
  const full: GaRegistrationRecord = { ...EMPTY_GA_REGISTRATION, filings: [], noChange: [], ...record }
  return withGaRegistration({ late_fee_policy: { kept: true } }, signGaRegistration(id, full, stamp, SECRET))
}

const run = (over: Partial<Parameters<typeof startGaOfficerChangeClock>[0]> = {}) =>
  startGaOfficerChangeClock({ db: fakeDb(), orgId: ORG, actorId: ACTOR, memberId: MEMBER, from: 'resident', to: 'board', today: '2027-03-10', secret: SECRET, ...over })

beforeEach(() => {
  h.rows = [{ id: GA, state: 'GA', governing_law_state: null, compliance_settings: { late_fee_policy: { kept: true } } }]
  h.updates = []
  h.audit = []
  h.readError = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('boardSeatChanged', () => {
  it('onto or off the board counts; board ↔ admin and no change do not', () => {
    expect(boardSeatChanged('resident', 'board')).toBe(true)
    expect(boardSeatChanged('resident', 'admin')).toBe(true)
    expect(boardSeatChanged('board', 'resident')).toBe(true)
    expect(boardSeatChanged('admin', 'resident')).toBe(true)
    expect(boardSeatChanged('board', 'admin')).toBe(false)
    expect(boardSeatChanged('admin', 'board')).toBe(false)
    expect(boardSeatChanged('board', 'board')).toBe(false)
    expect(boardSeatChanged('resident', 'resident')).toBe(false)
  })
})

describe('the officer_change edit', () => {
  const base: GaRegistrationRecord = { ...EMPTY_GA_REGISTRATION, filings: [], noChange: [] }
  const id = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

  it('adds a change; a second one the same day while the first is open adds nothing', () => {
    const one = applyGaRegistrationEdit(base, { op: 'officer_change', change: { id: id(1), on: '2027-03-10' } })
    expect(one.ok && one.record.officerChanges).toEqual([{ id: id(1), on: '2027-03-10' }])
    const two = applyGaRegistrationEdit(one.ok ? one.record : base, { op: 'officer_change', change: { id: id(2), on: '2027-03-10' } })
    expect(two.ok && two.record.officerChanges).toEqual([{ id: id(1), on: '2027-03-10' }])
  })

  it('a same-day change after the first was answered starts a new row', () => {
    const r = { ...base, officerChanges: [{ id: id(1), on: '2027-03-10' }], noChange: [id(1)] }
    const next = applyGaRegistrationEdit(r, { op: 'officer_change', change: { id: id(2), on: '2027-03-10' } })
    expect(next.ok && next.record.officerChanges?.map((c) => c.id)).toEqual([id(1), id(2)])
  })

  it(`keeps the newest ${MAX_OFFICER_CHANGES}`, () => {
    let r: GaRegistrationRecord = base
    for (let n = 1; n <= MAX_OFFICER_CHANGES + 3; n++) {
      const day = `2027-${String(Math.ceil(n / 28)).padStart(2, '0')}-${String(((n - 1) % 28) + 1).padStart(2, '0')}`
      const next = applyGaRegistrationEdit(r, { op: 'officer_change', change: { id: id(n), on: day } })
      if (!next.ok) throw new Error(next.error)
      r = next.record
    }
    expect(r.officerChanges).toHaveLength(MAX_OFFICER_CHANGES)
    expect(r.officerChanges![0]!.id).toBe(id(4))
  })

  it('refuses a malformed change', () => {
    expect(applyGaRegistrationEdit(base, { op: 'officer_change', change: { id: 'nope', on: '2027-03-10' } }).ok).toBe(false)
  })

  it('an amendment filed on or after the change covers it; one filed before does not', () => {
    const r: GaRegistrationRecord = {
      ...base,
      officerChanges: [{ id: id(1), on: '2027-03-10' }],
      filings: [{ id: id(9), kind: 'amendment', filedOn: '2027-03-09', confirmation: null, coversYear: null, reason: 'officers', meetingId: null }],
    }
    expect(amendmentFor(r, id(1))).toBeNull()
    const later = { ...r, filings: [{ ...r.filings[0]!, filedOn: '2027-03-10' }] }
    expect(amendmentFor(later, id(1))?.kind).toBe('filed')
  })
})

describe('the signature is unchanged for a record with no role changes', () => {
  it('an empty officerChanges signs exactly like a pre-BL-159 record', () => {
    const before: GaRegistrationRecord = { ...EMPTY_GA_REGISTRATION, filings: [], noChange: [] }
    const a = signGaRegistration(GA, before, stamp, SECRET)
    const b = signGaRegistration(GA, { ...before, officerChanges: [] }, stamp, SECRET)
    expect(b.sig).toBe(a.sig)
    expect('officerChanges' in a.record).toBe(false)
  })

  it('a record with role changes round-trips and verifies', () => {
    const s = signed({ officerChanges: [{ id: 'e0000000-0000-4000-8000-000000000001', on: '2027-03-10' }] })
    const read = readGaRegistration(GA, s, SECRET)
    expect(read.state).toBe('saved')
    expect(read.record.officerChanges).toEqual([{ id: 'e0000000-0000-4000-8000-000000000001', on: '2027-03-10' }])
  })
})

describe('startGaOfficerChangeClock', () => {
  it('a Georgia association: a signed change for today, other settings kept, one audit row of ids and codes', async () => {
    h.rows[0]!.compliance_settings = signed({ decision: 'register' })
    const res = await run()
    expect(res).toEqual({ kind: 'started', associationIds: [GA] })
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]!.settings.late_fee_policy).toEqual({ kept: true })
    const read = readGaRegistration(GA, h.rows[0]!.compliance_settings, SECRET)
    expect(read.state).toBe('saved')
    expect(read.record.decision).toBe('register')
    const changes = read.record.officerChanges ?? []
    expect(changes).toHaveLength(1)
    expect(changes[0]!.on).toBe('2027-03-10')
    expect(h.audit).toEqual([
      {
        org_id: ORG,
        user_id: ACTOR,
        action: GA_REGISTRATION_AUDIT_ACTION,
        entity_type: 'association',
        entity_id: GA,
        metadata: { op: 'officer_change', change_id: changes[0]!.id, member_id: MEMBER, from_role: 'resident', to_role: 'board' },
      },
    ])
  })

  it('starts from nothing recorded, too', async () => {
    expect(await run()).toEqual({ kind: 'started', associationIds: [GA] })
    expect(readGaRegistration(GA, h.rows[0]!.compliance_settings, SECRET).record.officerChanges).toHaveLength(1)
  })

  it('a second change the same day writes nothing new', async () => {
    await run()
    await run({ from: 'board', to: 'resident', memberId: ACTOR })
    expect(h.updates).toHaveLength(1)
    expect(h.audit).toHaveLength(1)
  })

  it('every Georgia association in the org; non-Georgia ones untouched', async () => {
    h.rows.push({ id: GA2, state: null, governing_law_state: 'GA', compliance_settings: null })
    h.rows.push({ id: FL, state: 'FL', governing_law_state: null, compliance_settings: { kept: 1 } })
    expect(await run()).toEqual({ kind: 'started', associationIds: [GA, GA2] })
    expect(h.updates.map((u) => u.id)).toEqual([GA, GA2])
    expect(h.rows[2]!.compliance_settings).toEqual({ kept: 1 })
  })

  it('no Georgia association: nothing to do', async () => {
    h.rows = [{ id: FL, state: 'FL', governing_law_state: null, compliance_settings: {} }]
    expect(await run()).toEqual({ kind: 'not_needed' })
    expect(h.updates).toHaveLength(0)
  })

  it('board ↔ admin is not an officer change: no read, no write', async () => {
    expect(await run({ from: 'board', to: 'admin' })).toEqual({ kind: 'not_needed' })
    expect(h.updates).toHaveLength(0)
    expect(h.audit).toHaveLength(0)
  })

  it('an unverified record is left alone and reported', async () => {
    const s = signed({ decision: 'register' })
    const forged = { ...s, ga_registration: { ...(s.ga_registration as object), sig: 'f00d' } }
    h.rows[0]!.compliance_settings = forged
    expect(await run()).toEqual({ kind: 'failed', associationIds: [GA] })
    expect(h.updates).toHaveLength(0)
    expect(h.rows[0]!.compliance_settings).toBe(forged)
  })

  it('no secret or a failed read: reported, nothing written', async () => {
    expect((await run({ secret: null })).kind).toBe('failed')
    h.readError = true
    expect(await run()).toEqual({ kind: 'failed', associationIds: [] })
    expect(h.updates).toHaveLength(0)
  })
})
