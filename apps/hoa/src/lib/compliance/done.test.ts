import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-131 FULL (migration 0067, M3_APPLIED): compliance_deadlines_done rows
// replace the signed acknowledgments. Flag off: no table read, acks only.
// Flag on: rows count, verified acks still count, and acks without a row
// are copied across lazily.

const h = vi.hoisted(() => ({
  m3: false,
  gate: { ok: true, orgId: 'org-1' } as { ok: boolean; orgId?: string; error?: string },
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  answers: {} as Record<string, { data: unknown; error: unknown }>,
}))

vi.mock('@homeowner-portal/db/m3', () => ({
  get M3_APPLIED() {
    return h.m3
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => h.gate,
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: 'org-1' }) }))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))

function fakeDb() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u-board' } } }) },
    from(table: string) {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'update', 'upsert', 'insert']) {
        b[op] = (...args: unknown[]) => {
          h.calls.push({ table, op, args })
          return b
        }
      }
      b.then = (resolve: (r: unknown) => unknown) => {
        const last = [...h.calls].reverse().find((c) => c.table === table)
        const key = `${table}.${last?.op === 'eq' ? 'select' : last?.op}`
        return Promise.resolve(h.answers[key] ?? h.answers[table] ?? { data: [], error: null }).then(resolve)
      }
      return b
    },
  }
}
const db = fakeDb()
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/load-or-fail', () => ({
  loadOrFail: async (_what: string, q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const r = await q
    return r.error ? { ok: false } : { ok: true, data: r.data }
  },
}))

import { markComplianceDeadlineDone } from './actions'
import {
  acksToMigrate,
  doneRowsByAssociation,
  pendingComplianceItems,
  signComplianceAck,
  withComplianceAck,
  type ComplianceAssociationInput,
} from './deadlines'
import { loadComplianceDoneAndMigrate } from './done'

const SECRET = 'test-secret'
const GA_ID = '11111111-1111-4111-8111-111111111111'
const GA_CODE = 'ga-sos-registration-2027'
const TX_CODE = 'tx-management-certificate'

function assoc(over: Partial<ComplianceAssociationInput> = {}): ComplianceAssociationInput {
  return { id: GA_ID, name: 'Peachtree Commons', state: 'GA', governingLawState: null, complianceSettings: {}, ...over }
}
const ackedSettings = () =>
  withComplianceAck({}, GA_CODE, signComplianceAck(GA_ID, GA_CODE, { doneAt: '2026-10-19T12:00:00Z', doneBy: 'u-old' }, SECRET))

beforeEach(() => {
  h.m3 = false
  h.gate = { ok: true, orgId: 'org-1' }
  h.calls.length = 0
  h.answers = {}
})

describe('pure helpers', () => {
  it('doneRowsByAssociation keys rows and drops unknown codes and malformed rows', () => {
    const done = doneRowsByAssociation([
      { association_id: GA_ID, code: GA_CODE, done_at: '2026-10-20T00:00:00Z', done_by: null },
      { association_id: GA_ID, code: 'not-a-deadline', done_at: '2026-10-20T00:00:00Z', done_by: null },
      { association_id: GA_ID, code: GA_CODE },
      null,
    ])
    expect([...done.get(GA_ID)!.keys()]).toEqual([GA_CODE])
  })

  it('pendingComplianceItems: a done row hides the deadline; without rows it is unchanged', () => {
    // Two Georgia items: the SB 406 registration and (BL-152) the corporation's 2027 annual registration.
    const codes = (d?: Parameters<typeof pendingComplianceItems>[3]) =>
      pendingComplianceItems([assoc()], '2026-10-20', SECRET, d).map((i) => i.deadline.code)
    expect(codes()).toEqual([GA_CODE, 'ga-corp-annual-registration-2027'])
    const done = doneRowsByAssociation([{ association_id: GA_ID, code: GA_CODE, done_at: '2026-10-20T00:00:00Z', done_by: 'u' }])
    expect(codes(done)).toEqual(['ga-corp-annual-registration-2027'])
    // Another association's row does not count.
    const other = doneRowsByAssociation([{ association_id: 'x', code: GA_CODE, done_at: '2026-10-20T00:00:00Z', done_by: 'u' }])
    expect(codes(other)).toHaveLength(2)
  })

  it('acksToMigrate lists only verified, applicable acknowledgments with no row', () => {
    const a = assoc({ complianceSettings: ackedSettings() })
    expect(acksToMigrate('org-1', [a], SECRET, new Map())).toEqual([
      { organization_id: 'org-1', association_id: GA_ID, code: GA_CODE, done_at: '2026-10-19T12:00:00Z', done_by: 'u-old' },
    ])
    expect(acksToMigrate('org-1', [a], 'wrong-secret', new Map())).toEqual([])
    const already = doneRowsByAssociation([{ association_id: GA_ID, code: GA_CODE, done_at: 'x', done_by: null }])
    expect(acksToMigrate('org-1', [a], SECRET, already)).toEqual([])
    // A TX acknowledgment on a GA association never becomes a row.
    const stray = withComplianceAck({}, TX_CODE, signComplianceAck(GA_ID, TX_CODE, { doneAt: 'x', doneBy: null }, SECRET))
    expect(acksToMigrate('org-1', [assoc({ complianceSettings: stray })], SECRET, new Map())).toEqual([])
  })
})

describe('loadComplianceDoneAndMigrate', () => {
  it('flag off: null, and the database is never touched', async () => {
    expect(await loadComplianceDoneAndMigrate(db, 'org-1', [assoc({ complianceSettings: ackedSettings() })], SECRET)).toBeNull()
    expect(h.calls).toEqual([])
  })

  it('flag on: reads the org’s rows and copies an unmigrated acknowledgment across', async () => {
    h.m3 = true
    const done = await loadComplianceDoneAndMigrate(db, 'org-1', [assoc({ complianceSettings: ackedSettings() })], SECRET)
    expect(h.calls).toContainEqual({ table: 'compliance_deadlines_done', op: 'eq', args: ['organization_id', 'org-1'] })
    const upsert = h.calls.find((c) => c.op === 'upsert')!
    expect(upsert.args[0]).toEqual([
      { organization_id: 'org-1', association_id: GA_ID, code: GA_CODE, done_at: '2026-10-19T12:00:00Z', done_by: 'u-old' },
    ])
    expect(upsert.args[1]).toEqual({ onConflict: 'association_id,code', ignoreDuplicates: true })
    expect(done!.get(GA_ID)!.has(GA_CODE)).toBe(true)
  })

  it('flag on: nothing to copy means no write', async () => {
    h.m3 = true
    h.answers['compliance_deadlines_done.select'] = {
      data: [{ association_id: GA_ID, code: GA_CODE, done_at: '2026-10-19T12:00:00Z', done_by: 'u-old' }],
      error: null,
    }
    await loadComplianceDoneAndMigrate(db, 'org-1', [assoc({ complianceSettings: ackedSettings() })], SECRET)
    expect(h.calls.some((c) => c.op === 'upsert')).toBe(false)
  })

  it('flag on: a failed read returns null (callers fall back to the acknowledgments)', async () => {
    h.m3 = true
    h.answers['compliance_deadlines_done.select'] = { data: null, error: { code: '42P01' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadComplianceDoneAndMigrate(db, 'org-1', [assoc()], SECRET)).toBeNull()
    expect(spy).toHaveBeenCalledWith('[compliance-deadlines] done rows read failed', { orgId: 'org-1', code: '42P01' })
    spy.mockRestore()
  })
})

describe('markComplianceDeadlineDone', () => {
  const input = { associationId: GA_ID, code: GA_CODE }
  beforeEach(() => {
    h.answers.associations = { data: [{ id: GA_ID, state: 'GA', governing_law_state: null, compliance_settings: {} }], error: null }
  })

  it('flag off: signs an acknowledgment into compliance_settings, no table write', async () => {
    h.answers['associations.select'] = h.answers.associations
    h.answers['associations.update'] = { data: [{ id: GA_ID }], error: null }
    expect(await markComplianceDeadlineDone(input)).toEqual({ ok: true })
    expect(h.calls.some((c) => c.table === 'compliance_deadlines_done')).toBe(false)
    expect(h.calls.some((c) => c.table === 'associations' && c.op === 'update')).toBe(true)
  })

  it('flag on: writes a compliance_deadlines_done row and leaves compliance_settings alone', async () => {
    h.m3 = true
    h.answers['associations.select'] = h.answers.associations
    expect(await markComplianceDeadlineDone(input)).toEqual({ ok: true })
    const upsert = h.calls.find((c) => c.table === 'compliance_deadlines_done' && c.op === 'upsert')!
    expect(upsert.args[0]).toMatchObject({ organization_id: 'org-1', association_id: GA_ID, code: GA_CODE, done_by: 'u-board' })
    expect(upsert.args[1]).toEqual({ onConflict: 'association_id,code', ignoreDuplicates: true })
    expect(h.calls.some((c) => c.table === 'associations' && c.op === 'update')).toBe(false)
  })

  it('flag on: still refuses a non-board caller before any read', async () => {
    h.m3 = true
    h.gate = { ok: false, error: 'denied' }
    expect(await markComplianceDeadlineDone(input)).toEqual({ ok: false, error: 'denied' })
    expect(h.calls).toEqual([])
  })

  it('flag on: a deadline that does not apply to the state is refused', async () => {
    h.m3 = true
    h.answers['associations.select'] = h.answers.associations
    expect(await markComplianceDeadlineDone({ associationId: GA_ID, code: TX_CODE })).toMatchObject({ ok: false })
    expect(h.calls.some((c) => c.table === 'compliance_deadlines_done')).toBe(false)
  })
})
