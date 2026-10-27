import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-161 updateGaComplaint: board/admin only and refused before any client
// exists; units of the caller's org in a Georgia association only; every
// save writes a SIGNED record (the gate trusts nothing else), keeps every
// other settings key, and writes one audit row with ids and codes only —
// never a date the board typed.

const ORG = 'org-1'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const UNIT = 'b0000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  state: 'GA' as string | null,
  settings: {} as Record<string, unknown>,
  clients: 0,
  updates: [] as Array<Record<string, unknown>>,
  audit: [] as Array<Record<string, unknown>>,
  secret: 'test-secret' as string | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => h.secret }))

function fakeClient() {
  h.clients += 1
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
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
            h.updates.push(update)
            h.settings = update.compliance_settings as Record<string, unknown>
            return Promise.resolve({ data: [{ id: ASSOC }], error: null }).then(res)
          }
          let rows: unknown[] = []
          if (table === 'units' && filters.organization_id === ORG && filters.id === UNIT) rows = [{ id: UNIT, association_id: ASSOC }]
          if (table === 'associations' && filters.organization_id === ORG && filters.id === ASSOC) {
            rows = [{ id: ASSOC, state: h.state, governing_law_state: null, compliance_settings: h.settings }]
          }
          return Promise.resolve({ data: rows, error: null }).then(res)
        },
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeClient()) }))

const { updateGaComplaint } = await import('./actions')
const { readGaComplaints } = await import('./store')
const { GA_COMPLAINT_AUDIT_ACTION, stayedUnitsOn } = await import('./model')

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.state = 'GA'
  h.settings = { ga_registration: { kept: true } }
  h.clients = 0
  h.updates = []
  h.audit = []
  h.secret = 'test-secret'
})

const add = { op: 'add' as const, unitId: UNIT, filedOn: '2026-10-20', subject: 'fines' as const }

describe('updateGaComplaint', () => {
  it('refuses a resident before any client is made', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect(await updateGaComplaint(add)).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(h.clients).toBe(0)
  })

  it('records a signed complaint the gate can verify, keeping other settings keys', async () => {
    expect(await updateGaComplaint(add)).toEqual({ ok: true })
    expect(h.settings.ga_registration).toEqual({ kept: true })
    const read = readGaComplaints(ASSOC, h.settings, 'test-secret')
    expect(read.state).toBe('saved')
    expect(read.record.units[UNIT]).toEqual([expect.objectContaining({ filedOn: '2026-10-20', subject: 'fines', conclusionsOn: null })])
    expect([...(stayedUnitsOn(read, '2027-01-05') as Set<string>)]).toEqual([UNIT])
  })

  it('records the conclusions and the extension, then removes, auditing ids and codes only', async () => {
    await updateGaComplaint(add)
    const id = readGaComplaints(ASSOC, h.settings, 'test-secret').record.units[UNIT]![0]!.id
    expect(await updateGaComplaint({ op: 'conclude', unitId: UNIT, complaintId: id, conclusionsOn: '2026-10-22', extended: true })).toEqual({ ok: true })
    expect(readGaComplaints(ASSOC, h.settings, 'test-secret').record.units[UNIT]![0]).toMatchObject({ conclusionsOn: '2026-10-22', extended: true })
    expect(await updateGaComplaint({ op: 'remove', unitId: UNIT, complaintId: id })).toEqual({ ok: true })
    expect(readGaComplaints(ASSOC, h.settings, 'test-secret').record.units).toEqual({})
    expect(h.audit.map((r) => (r.metadata as { op: string }).op)).toEqual(['add', 'conclude', 'remove'])
    for (const row of h.audit) {
      expect(row).toMatchObject({ action: GA_COMPLAINT_AUDIT_ACTION, entity_type: 'unit', entity_id: UNIT, org_id: ORG })
      expect(JSON.stringify(row.metadata)).not.toMatch(/2026-10-2\d/)
    }
    expect(h.audit[1]!.metadata).toMatchObject({ concluded: true, extended: true })
  })

  it('refuses a unit outside Georgia, and one not in the org, writing nothing', async () => {
    h.state = 'FL'
    expect(await updateGaComplaint(add)).toEqual({ ok: false, error: 'The Secretary of State complaint record is for Georgia associations.' })
    h.state = 'GA'
    expect((await updateGaComplaint({ ...add, unitId: 'b0000000-0000-4000-8000-000000000009' })).ok).toBe(false)
    expect(h.updates).toEqual([])
    expect(h.audit).toEqual([])
  })

  it('refuses a future day, an unknown subject, and no secret', async () => {
    expect(await updateGaComplaint({ ...add, filedOn: '2099-01-01' })).toMatchObject({ ok: false, field: 'filedOn' })
    expect(await updateGaComplaint({ ...add, subject: 'dues' as never })).toMatchObject({ ok: false, field: 'subject' })
    h.secret = null
    expect((await updateGaComplaint(add)).ok).toBe(false)
    expect(h.updates).toEqual([])
  })

  it('a forged record is not built on: the save starts from empty', async () => {
    h.settings = { ga_sos_complaints: { v: 1, record: { units: {} }, updated_at: 'x', updated_by: null, sig: 'bad' } }
    await updateGaComplaint(add)
    expect(readGaComplaints(ASSOC, h.settings, 'test-secret').state).toBe('saved')
  })
})
