import { describe, expect, it, vi } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { findContactPII } from '@homeowner-portal/ai/pii'
import { ContactVault } from './contact-placeholders'

const W1 = vi.hoisted(() => ({ queryGoverningDocs: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W1', () => W1)

const { TOOL_BY_NAME, ToolFailure } = await import('./tools')

/**
 * BL-047: the Q&A agent states these counts to a board member as facts.
 * The fake caps each response at 1000 rows like PostgREST's max_rows.
 */
const ORG = 'org-1'
const ctx = (db: unknown, canSeeOwnerContact = true, contactVault = new ContactVault()) => ({
  db: db as never,
  orgId: ORG,
  canSeeOwnerContact,
  contactVault,
})
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

const props = Array.from({ length: 1700 }, (_, i) => ({
  id: id('p', i),
  org_id: ORG,
  deleted_at: null,
  tenure: i < 400 ? 'leased' : 'owner_occupied',
}))
const violations = Array.from({ length: 1300 }, (_, i) => ({
  id: id('v', i),
  org_id: ORG,
  deleted_at: null,
  status: i < 1100 ? 'open' : 'notice_sent',
}))

/** A query chain that resolves to one fixed `{ data, error }` whatever is asked. */
function fixedDb(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'lt', 'ilike', 'order', 'limit']) q[m] = () => q
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { from: () => q }
}

/** True when no key anywhere in `v` contains an underscore (RC-11). */
function camelOnly(v: unknown): boolean {
  if (Array.isArray(v)) return v.every(camelOnly)
  if (v && typeof v === 'object') {
    return Object.entries(v).every(([k, x]) => !k.includes('_') && camelOnly(x))
  }
  return true
}

describe('community Q&A count tools', () => {
  it('count_units_by_tenure counts every property, camelCase', async () => {
    const { db } = cappedFakeDb({ hoa_properties: props })
    const r = await TOOL_BY_NAME.count_units_by_tenure!.execute({}, ctx(db))
    expect(r).toEqual({ ownerOccupied: 1300, leased: 400, unknown: 0, total: 1700 })
  })

  it('count_open_violations counts every violation, statuses as values not keys', async () => {
    const { db } = cappedFakeDb({ hoa_violations: violations })
    const r = await TOOL_BY_NAME.count_open_violations!.execute({}, ctx(db))
    expect(r).toEqual({
      total: 1300,
      byStatus: [
        { status: 'notice_sent', count: 200 },
        { status: 'open', count: 1100 },
      ],
    })
    expect(camelOnly(r)).toBe(true)
  })

  it('a failed later page throws a coded ToolFailure, keeping the db code for the log only', async () => {
    const { db } = cappedFakeDb({ hoa_properties: props }, { failAt: { table: 'hoa_properties', from: 1000 } })
    const p = TOOL_BY_NAME.count_units_by_tenure!.execute({}, ctx(db))
    await expect(p).rejects.toBeInstanceOf(ToolFailure)
    await expect(p).rejects.toMatchObject({ code: 'lookup_failed', dbCode: '57014', message: 'lookup_failed' })
  })

  it('count_properties throws on a failed count instead of answering 0', async () => {
    const { db } = cappedFakeDb({ hoa_properties: props }, { failAt: { table: 'hoa_properties' } })
    await expect(TOOL_BY_NAME.count_properties!.execute({}, ctx(db))).rejects.toMatchObject({ code: 'lookup_failed' })
    const ok = cappedFakeDb({ hoa_properties: props })
    expect(await TOOL_BY_NAME.count_properties!.execute({}, ctx(ok.db))).toEqual({ totalProperties: 1700 })
  })
})

describe('list_overdue_dues', () => {
  it('returns camelCase rows with integer cents', async () => {
    const db = fixedDb({
      data: [
        {
          id: 'a1',
          amount: '125.10',
          due_date: '2026-01-01',
          status: 'pending',
          unit: { address_line1: '1 Elm St', lot_number: '7' },
          payments: [{ amount: '25.05' }, { amount: 0.02 }],
        },
      ],
      error: null,
    })
    const r = (await TOOL_BY_NAME.list_overdue_dues!.execute({}, ctx(db))) as Array<Record<string, unknown>>
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      address: '1 Elm St',
      lotNumber: '7',
      amountDueCents: 12510,
      amountRemainingCents: 10003,
      dueDate: '2026-01-01',
      status: 'pending',
    })
    expect(Number.isInteger(r[0]!.daysOverdue)).toBe(true)
    expect(camelOnly(r)).toBe(true)
  })

  it('counts days overdue on the association calendar at 23:30 Eastern (BL-043)', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-02T03:30:00Z')) // Oct 1, 23:30 EDT
      const lt: unknown[] = []
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'is', 'order', 'limit']) q[m] = () => q
      q.lt = (_c: string, v: unknown) => {
        lt.push(v)
        return q
      }
      const rows = [
        { id: 'a1', amount: 10, due_date: '2026-09-30', status: 'open', unit: null, payments: [] },
      ]
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
      // associations → FL (Eastern); every other table → the overdue rows.
      const db = {
        from: (t: string) =>
          t === 'associations'
            ? { select: () => ({ eq: async () => ({ data: [{ name: 'A', state: 'FL' }], error: null }) }) }
            : q,
      }
      const r = (await TOOL_BY_NAME.list_overdue_dues!.execute({}, ctx(db as never))) as Array<Record<string, unknown>>
      expect(lt).toEqual(['2026-10-01']) // not the UTC '2026-10-02'
      expect(r[0]!.daysOverdue).toBe(1) // not 2
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws instead of answering "nobody is overdue" when the read fails', async () => {
    const db = fixedDb({ data: null, error: { code: '42P01', message: 'relation "assessments" does not exist' } })
    await expect(TOOL_BY_NAME.list_overdue_dues!.execute({}, ctx(db))).rejects.toMatchObject({
      code: 'lookup_failed',
      message: 'lookup_failed',
    })
  })
})

describe('get_unit_owner', () => {
  const row = {
    id: 'p1',
    address: '829 Pistace Ct',
    owner_name: 'Pat Owner',
    owner_email: 'pat@example.com',
    owner_phone: '555-0100',
    tenure: 'owner_occupied',
  }

  it('gives the model contact tokens, never the raw email or phone (BL-062)', async () => {
    const vault = new ContactVault()
    const r = await TOOL_BY_NAME.get_unit_owner!.execute(
      { address: '829' },
      ctx(fixedDb({ data: [row], error: null }), true, vault),
    )
    expect(r).toEqual({
      matches: [
        {
          address: '829 Pistace Ct',
          ownerName: 'Pat Owner',
          contactOnFile: true,
          ownerEmail: '[OWNER_EMAIL_1]',
          ownerPhone: '[OWNER_PHONE_1]',
          tenure: 'owner_occupied',
        },
      ],
    })
    expect(findContactPII(JSON.stringify(r))).toEqual([])
    expect(vault.resolve('[OWNER_EMAIL_1]')).toBe('pat@example.com')
    expect(vault.resolve('[OWNER_PHONE_1]')).toBe('555-0100')
  })

  it('says no contact is on file without inventing a token', async () => {
    const vault = new ContactVault()
    const bare = { ...row, owner_email: null, owner_phone: '  ' }
    const r = await TOOL_BY_NAME.get_unit_owner!.execute({ address: '829' }, ctx(fixedDb({ data: [bare], error: null }), true, vault))
    expect(r).toEqual({
      matches: [{ address: '829 Pistace Ct', ownerName: 'Pat Owner', contactOnFile: false, ownerEmail: null, ownerPhone: null, tenure: 'owner_occupied' }],
    })
    expect(vault.size).toBe(0)
  })

  it('a caller who may not see owner contact gets neither tokens nor vault entries', async () => {
    const vault = new ContactVault()
    const r = await TOOL_BY_NAME.get_unit_owner!.execute({ address: '829' }, ctx(fixedDb({ data: [row], error: null }), false, vault))
    expect(r).toEqual({
      matches: [{ address: '829 Pistace Ct', ownerName: 'Pat Owner', contactOnFile: true, tenure: 'owner_occupied' }],
    })
    expect(vault.size).toBe(0)
  })

  it('the public view never carries owner contact or its tokens', () => {
    const pub = TOOL_BY_NAME.get_unit_owner!.toPublic!({
      matches: [
        { address: '829 Pistace Ct', ownerName: 'Pat Owner', contactOnFile: true, ownerEmail: '[OWNER_EMAIL_1]', ownerPhone: '[OWNER_PHONE_1]', tenure: null },
      ],
    })
    expect(pub).toEqual({ matches: [{ address: '829 Pistace Ct', ownerName: 'Pat Owner', tenure: null }] })
  })

  it('a missing address is a coded failure, not free text', async () => {
    await expect(TOOL_BY_NAME.get_unit_owner!.execute({}, ctx(fixedDb({ data: [], error: null })))).rejects.toMatchObject({
      code: 'invalid_args',
    })
  })

  it('a failed read throws instead of answering "no match"', async () => {
    const db = fixedDb({ data: null, error: { code: '57014', message: 'canceling statement' } })
    await expect(TOOL_BY_NAME.get_unit_owner!.execute({ address: '829' }, ctx(db))).rejects.toMatchObject({ code: 'lookup_failed' })
  })
})

describe('list_recent_meetings', () => {
  it('returns camelCase rows and throws on a failed read', async () => {
    const ok = fixedDb({ data: [{ id: 'm1', meeting_date: '2026-03-01', meeting_type: 'board', status: 'approved' }], error: null })
    expect(await TOOL_BY_NAME.list_recent_meetings!.execute({}, ctx(ok))).toEqual([
      { meetingDate: '2026-03-01', meetingType: 'board', status: 'approved' },
    ])
    const bad = fixedDb({ data: null, error: { code: '57014', message: 'x' } })
    await expect(TOOL_BY_NAME.list_recent_meetings!.execute({}, ctx(bad))).rejects.toMatchObject({ code: 'lookup_failed' })
  })
})

describe('search_governing_docs', () => {
  it('a W1 failure is a coded docs_unavailable, never the provider text', async () => {
    W1.queryGoverningDocs.mockRejectedValueOnce(new Error('pgvector: relation hoa_doc_chunks missing; key sk-live-123'))
    const p = TOOL_BY_NAME.search_governing_docs!.execute({ question: 'pets' }, ctx(fixedDb({ data: null, error: null })))
    await expect(p).rejects.toMatchObject({ code: 'docs_unavailable', message: 'docs_unavailable' })
  })

  it('returns only the fields it names', async () => {
    W1.queryGoverningDocs.mockResolvedValueOnce({
      answer: 'Two pets.',
      confidence: 'HIGH',
      citations: [{ chunkId: 'c1', documentId: 'd1', docType: 'ccrs', section: '4.2', passage: 'x' }],
      runId: 'r1',
      raw_debug: 'nope',
    })
    const r = await TOOL_BY_NAME.search_governing_docs!.execute({ question: 'pets' }, ctx(fixedDb({ data: null, error: null })))
    expect(r).toEqual({
      answer: 'Two pets.',
      confidence: 'HIGH',
      citations: [{ chunkId: 'c1', documentId: 'd1', docType: 'ccrs', section: '4.2' }],
      runId: 'r1',
    })
  })
})
