import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-145: the evidence reads (lib/compliance/evidence.ts), the annual-meeting
// read (overview-load.ts) and the evidence server actions (actions.ts).
// M5_APPLIED off: no document_id is ever selected or written.

const h = vi.hoisted(() => ({
  m3: true,
  m5: false,
  gate: { ok: true } as { ok: boolean; error?: string },
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  /** Answer for the next query on `table` (first match wins), else { data: [], error: null }. */
  answers: [] as Array<{ table: string; when?: (ops: string[]) => boolean; res: { data: unknown; error: unknown } }>,
}))

vi.mock('@homeowner-portal/db/m3', () => ({
  get M3_APPLIED() {
    return h.m3
  },
}))
vi.mock('@homeowner-portal/db/m5', () => ({
  get M5_APPLIED() {
    return h.m5
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'denied', requireBoardOrAdminForAction: async () => h.gate }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: 'org-1' }) }))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))

/** A chainable fake that records every call and resolves per table. */
function fakeDb() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u-board' } } }) },
    from(table: string) {
      const ops: string[] = []
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'in', 'order', 'range', 'limit', 'update', 'upsert', 'insert']) {
        b[op] = (...args: unknown[]) => {
          ops.push(op)
          h.calls.push({ table, op, args })
          return b
        }
      }
      b.then = (resolve: (r: unknown) => unknown) => {
        const i = h.answers.findIndex((a) => a.table === table && (!a.when || a.when(ops)))
        const res = i >= 0 ? h.answers.splice(i, 1)[0]!.res : { data: [], error: null }
        return Promise.resolve(res).then(resolve)
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

import { attachComplianceEvidence, markComplianceDeadlineDone } from './actions'
import { attachedDocumentIds, loadComplianceDoneWithEvidence, loadEvidenceDocuments } from './evidence'
import { loadAnnualMeetings, loadElectionMeetings } from './overview-load'

const GA = '11111111-1111-4111-8111-111111111111'
const DOC = '66666666-6666-4666-8666-666666666666'
const CODE = 'ga-sos-registration-2027'
const ops = (table: string, op: string) => h.calls.filter((c) => c.table === table && c.op === op)

beforeEach(() => {
  h.m3 = true
  h.m5 = false
  h.gate = { ok: true }
  h.calls.length = 0
  h.answers = []
})

describe('loadComplianceDoneWithEvidence', () => {
  it('M3 off: an empty map and no read', async () => {
    expect(await loadComplianceDoneWithEvidence(db, 'org-1', { live: false })).toEqual(new Map())
    expect(h.calls).toEqual([])
  })

  it('M5 off: never selects document_id (the column does not exist before 0069)', async () => {
    h.answers.push({ table: 'compliance_deadlines_done', res: { data: [{ association_id: GA, code: CODE, done_at: '2026-10-02T00:00:00Z', document_id: DOC }], error: null } })
    const done = await loadComplianceDoneWithEvidence(db, 'org-1')
    expect(ops('compliance_deadlines_done', 'select')[0]!.args[0]).toBe('association_id, code, done_at')
    expect(ops('compliance_deadlines_done', 'eq')[0]!.args).toEqual(['organization_id', 'org-1'])
    expect(done!.get(GA)!.get(CODE)).toEqual({ doneAt: '2026-10-02T00:00:00Z', documentId: null })
  })

  it('M5 on: reads the evidence, scoped to the org (and the association when given); unknown codes dropped', async () => {
    h.m5 = true
    h.answers.push({
      table: 'compliance_deadlines_done',
      res: {
        data: [
          { association_id: GA, code: CODE, done_at: '2026-10-02T00:00:00Z', document_id: DOC },
          { association_id: GA, code: 'not-a-code', done_at: '2026-10-02T00:00:00Z', document_id: null },
        ],
        error: null,
      },
    })
    const done = await loadComplianceDoneWithEvidence(db, 'org-1', { associationId: GA })
    expect(ops('compliance_deadlines_done', 'select')[0]!.args[0]).toBe('association_id, code, done_at, document_id')
    expect(ops('compliance_deadlines_done', 'eq').map((c) => c.args)).toEqual([
      ['organization_id', 'org-1'],
      ['association_id', GA],
    ])
    expect([...done!.get(GA)!.entries()]).toEqual([[CODE, { doneAt: '2026-10-02T00:00:00Z', documentId: DOC }]])
    expect(attachedDocumentIds(done)).toEqual([DOC])
  })

  it('a failed read is null, logged with codes only', async () => {
    h.answers.push({ table: 'compliance_deadlines_done', res: { data: null, error: { code: '42703', message: 'secret detail' } } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadComplianceDoneWithEvidence(db, 'org-1')).toBeNull()
    expect(spy).toHaveBeenCalledWith('[compliance] done rows read failed', { orgId: 'org-1', code: '42703' })
    spy.mockRestore()
  })
})

describe('loadEvidenceDocuments', () => {
  it('flag off: [] without a read', async () => {
    expect(await loadEvidenceDocuments(db, 'org-1', [DOC], false)).toEqual([])
    expect(h.calls).toEqual([])
  })

  it('the org’s newest documents, plus the name of an older attached one', async () => {
    h.answers.push({ table: 'hoa_documents', when: (o) => o.includes('range'), res: { data: [{ id: 'd-new', name: ' Minutes ' }], error: null } })
    h.answers.push({ table: 'hoa_documents', when: (o) => o.includes('in'), res: { data: [{ id: DOC, name: null }], error: null } })
    const docs = await loadEvidenceDocuments(db, 'org-1', [DOC, DOC], true)
    expect(docs).toEqual([
      { id: 'd-new', name: 'Minutes' },
      { id: DOC, name: 'Untitled document' },
    ])
    expect(ops('hoa_documents', 'eq').every((c) => c.args[0] === 'org_id' && c.args[1] === 'org-1')).toBe(true)
    expect(ops('hoa_documents', 'in')[0]!.args).toEqual(['id', [DOC]])
  })
})

describe('loadAnnualMeetings', () => {
  it('the last annual meeting before today, the next from today, and its notice day', async () => {
    h.answers.push({
      table: 'hoa_meeting_minutes',
      res: {
        data: [
          { id: 'm-next2', meeting_date: '2027-06-01' },
          { id: 'm-next', meeting_date: '2026-12-15' },
          { id: 'm-last', meeting_date: '2026-03-03' },
          { id: 'm-old', meeting_date: '2025-03-04' },
        ],
        error: null,
      },
    })
    h.answers.push({ table: 'communications', res: { data: [{ id: 'c1', status: 'sent', sent_at: '2026-11-01T14:00:00Z', scheduled_for: null, created_at: 'x' }], error: null } })
    expect(await loadAnnualMeetings(db, 'org-1', '2026-10-21')).toEqual({
      lastHeld: '2026-03-03',
      next: { id: 'm-next', date: '2026-12-15' },
      nextNoticeSentOn: '2026-11-01',
    })
    const eqs = ops('hoa_meeting_minutes', 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['org_id', 'org-1'])
    expect(eqs).toContainEqual(['meeting_type', 'annual'])
  })

  it('nothing scheduled: no notice read; a failed read is null', async () => {
    h.answers.push({ table: 'hoa_meeting_minutes', res: { data: [], error: null } })
    expect(await loadAnnualMeetings(db, 'org-1', '2026-10-21')).toEqual({ lastHeld: null, next: null, nextNoticeSentOn: null })
    expect(h.calls.some((c) => c.table === 'communications')).toBe(false)
    h.answers.push({ table: 'hoa_meeting_minutes', res: { data: null, error: { code: '57014' } } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadAnnualMeetings(db, 'org-1', '2026-10-21')).toBeNull()
    spy.mockRestore()
  })
})

describe('loadElectionMeetings (BL-151)', () => {
  const M1 = 'a1111111-1111-4111-8111-111111111111'
  const M2 = 'a2222222-2222-4222-8222-222222222222'
  const assoc = (settings: unknown) => ({ id: GA, name: 'Maple', state: 'GA', governingLawState: null, complianceSettings: settings })

  it('reads only the stored meetings, by id, in this org, not deleted; ignores keys that are not ids', async () => {
    h.answers.push({
      table: 'hoa_meeting_minutes',
      res: { data: [{ id: M1, meeting_date: '2027-01-15', meeting_type: 'annual' }, { id: M2, meeting_date: null, meeting_type: 'special' }], error: null },
    })
    const out = await loadElectionMeetings(db, 'org-1', [assoc({ meeting_elections: { [M1]: {}, [M2]: {}, 'not-an-id': {} } })])
    expect(out).toEqual(new Map([[M1, { id: M1, date: '2027-01-15', type: 'annual' }]]))
    expect(ops('hoa_meeting_minutes', 'eq').map((c) => c.args)).toContainEqual(['org_id', 'org-1'])
    expect(ops('hoa_meeting_minutes', 'in')[0]!.args).toEqual(['id', [M1, M2]])
    expect(ops('hoa_meeting_minutes', 'is')[0]!.args).toEqual(['deleted_at', null])
  })

  it('no election stored: no read at all; a failed read is null', async () => {
    expect(await loadElectionMeetings(db, 'org-1', [assoc({})])).toEqual(new Map())
    expect(h.calls.length).toBe(0)
    h.answers.push({ table: 'hoa_meeting_minutes', res: { data: null, error: { code: '57014' } } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadElectionMeetings(db, 'org-1', [assoc({ meeting_elections: { [M1]: {} } })])).toBeNull()
    spy.mockRestore()
  })
})

describe('markComplianceDeadlineDone with evidence', () => {
  const assocRow = { table: 'associations', res: { data: [{ id: GA, state: 'GA', governing_law_state: null, compliance_settings: {} }], error: null } }

  it('M5 off: a document is refused before any read or write', async () => {
    expect(await markComplianceDeadlineDone({ associationId: GA, code: CODE, documentId: DOC })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(h.calls).toEqual([])
  })

  it('M5 off, no document: unchanged (no document_id in the row)', async () => {
    h.answers.push(assocRow)
    expect(await markComplianceDeadlineDone({ associationId: GA, code: CODE })).toEqual({ ok: true })
    expect(ops('compliance_deadlines_done', 'upsert')[0]!.args[0]).not.toHaveProperty('document_id')
  })

  it('M5 on: another org’s document is refused before the write', async () => {
    h.m5 = true
    h.answers.push(assocRow, { table: 'hoa_documents', res: { data: [], error: null } })
    expect(await markComplianceDeadlineDone({ associationId: GA, code: CODE, documentId: DOC })).toEqual({
      ok: false,
      error: 'That document isn’t in your association’s documents.',
    })
    expect(ops('hoa_documents', 'eq').map((c) => c.args)).toEqual([
      ['org_id', 'org-1'],
      ['id', DOC],
    ])
    expect(h.calls.some((c) => c.table === 'compliance_deadlines_done')).toBe(false)
  })

  it('M5 on: the org’s document goes on the row, and onto a row someone else just made if it has none', async () => {
    h.m5 = true
    h.answers.push(assocRow, { table: 'hoa_documents', res: { data: [{ id: DOC }], error: null } })
    expect(await markComplianceDeadlineDone({ associationId: GA, code: CODE, documentId: DOC })).toEqual({ ok: true })
    expect(ops('compliance_deadlines_done', 'upsert')[0]!.args[0]).toMatchObject({ organization_id: 'org-1', association_id: GA, code: CODE, document_id: DOC })
    expect(ops('compliance_deadlines_done', 'update')[0]!.args[0]).toEqual({ document_id: DOC })
    expect(ops('compliance_deadlines_done', 'is')[0]!.args).toEqual(['document_id', null])
  })

  it('a malformed document id is refused', async () => {
    h.m5 = true
    expect(await markComplianceDeadlineDone({ associationId: GA, code: CODE, documentId: 'nope' })).toEqual({ ok: false, error: 'Invalid input.' })
  })
})

describe('attachComplianceEvidence', () => {
  it('M5 off: refused, nothing read', async () => {
    expect(await attachComplianceEvidence({ associationId: GA, code: CODE, documentId: DOC })).toMatchObject({ ok: false })
    expect(h.calls).toEqual([])
  })

  it('a non-board caller is refused before anything', async () => {
    h.m5 = true
    h.gate = { ok: false, error: 'denied' }
    expect(await attachComplianceEvidence({ associationId: GA, code: CODE, documentId: DOC })).toEqual({ ok: false, error: 'denied' })
    expect(h.calls).toEqual([])
  })

  it('sets the document on the org’s own row', async () => {
    h.m5 = true
    h.answers.push({ table: 'hoa_documents', res: { data: [{ id: DOC }], error: null } })
    h.answers.push({ table: 'compliance_deadlines_done', res: { data: [{ id: 'row-1' }], error: null } })
    expect(await attachComplianceEvidence({ associationId: GA, code: CODE, documentId: DOC })).toEqual({ ok: true })
    expect(ops('compliance_deadlines_done', 'update')[0]!.args[0]).toEqual({ document_id: DOC })
    expect(ops('compliance_deadlines_done', 'eq').map((c) => c.args)).toEqual([
      ['organization_id', 'org-1'],
      ['association_id', GA],
      ['code', CODE],
    ])
  })

  it('clears it with null (no document check); a row that isn’t done yet says so', async () => {
    h.m5 = true
    h.answers.push({ table: 'compliance_deadlines_done', res: { data: [{ id: 'row-1' }], error: null } })
    expect(await attachComplianceEvidence({ associationId: GA, code: CODE, documentId: null })).toEqual({ ok: true })
    expect(h.calls.some((c) => c.table === 'hoa_documents')).toBe(false)
    h.answers.push({ table: 'compliance_deadlines_done', res: { data: [], error: null } })
    expect(await attachComplianceEvidence({ associationId: GA, code: CODE, documentId: null })).toEqual({
      ok: false,
      error: 'Mark it as done first, then attach the evidence.',
    })
  })
})
