import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

const h = vi.hoisted(() => ({
  gate: vi.fn(async (): Promise<unknown> => ({ ok: true, role: 'board', orgId: 'org-1' })),
  getClient: vi.fn(async (): Promise<unknown> => {
    throw new Error('must not build a client before the gate')
  }),
}))

vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'denied', requireBoardOrAdminForAction: h.gate }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: h.getClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => {
    throw new Error('the board import must never use the service-role client')
  },
}))

const { beginRosterImport, commitRosterChunk, previewRosterMatches } = await import('./actions')

// Synthetic fixtures only.
const ORG = 'org-1'
const A1 = '00000000-0000-4000-8000-000000000001'
const A2 = '00000000-0000-4000-8000-000000000002'
const row = (n: number, address: string, extra: Record<string, unknown> = {}) => ({
  row: n,
  address,
  unit: null,
  city: null,
  state: null,
  zip: null,
  ownerName: null,
  ownerEmail: null,
  ownerPhone: null,
  mailingAddress: null,
  tenure: null,
  ...extra,
})
const counts = { total: 3, new: 2, update: 0, duplicate: 1, error: 0 }
const client = (seed: Record<string, Record<string, unknown>[]> = {}) => {
  const m = memorySupabase({ associations: [{ id: A1, organization_id: ORG, name: 'A' }], ...seed })
  ;(m.client as unknown as { auth: unknown }).auth = { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }
  h.getClient.mockResolvedValue(m.client)
  return m
}

let errors: ReturnType<typeof vi.spyOn>
let infos: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  h.gate.mockResolvedValue({ ok: true, role: 'board', orgId: ORG })
  h.getClient.mockReset()
  h.getClient.mockImplementation(async () => {
    throw new Error('must not build a client before the gate')
  })
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  infos = vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('the board gate runs before any client', () => {
  it.each([
    ['previewRosterMatches', () => previewRosterMatches({ homes: [] })],
    ['beginRosterImport', () => beginRosterImport({ associationId: null, mode: 'skip', counts, fileType: 'csv', preset: 'generic' })],
    ['commitRosterChunk', () => commitRosterChunk({ associationId: null, mode: 'skip', homes: [{ rows: [row(2, '1 Test Way')] }] })],
  ])('%s refuses a non-board caller without building a client', async (_name, call) => {
    h.gate.mockResolvedValue({ ok: false, error: 'denied' })
    expect(await call()).toEqual({ ok: false, error: 'denied' })
    expect(h.getClient).not.toHaveBeenCalled()
  })

  it('no roster module imports the service-role client', () => {
    for (const f of ['actions.ts', 'commit.ts']) {
      const src = readFileSync(resolve(__dirname, f), 'utf8')
      expect(src, f).not.toMatch(/createAdminClient|service.?role.*client\(/i)
    }
  })
})

describe('previewRosterMatches', () => {
  it('reads only this org’s live homes and answers per row', async () => {
    client({
      hoa_properties: [
        { id: 'p1', org_id: ORG, address: '1 Test Way', unit_number: null, deleted_at: null },
        { id: 'p-other', org_id: 'org-2', address: '2 Test Way', unit_number: null, deleted_at: null },
        { id: 'p-gone', org_id: ORG, address: '3 Test Way', unit_number: null, deleted_at: '2026-01-01' },
      ],
    })
    const r = await previewRosterMatches({
      homes: [
        { address: '1 test way', unit: null },
        { address: '2 Test Way', unit: null },
        { address: '3 Test Way', unit: null },
      ],
    })
    expect(r).toEqual({ ok: true, matches: [{ kind: 'match', propertyId: 'p1' }, { kind: 'none' }, { kind: 'none' }] })
  })

  it('a failed read is a plain message', async () => {
    const m = memorySupabase({}, { failOn: (c) => (c.table === 'hoa_properties' ? { code: '42501', message: 'permission denied for table hoa_properties' } : null) })
    h.getClient.mockResolvedValue(m.client)
    expect(await previewRosterMatches({ homes: [{ address: '1 Test Way', unit: null }] })).toEqual({
      ok: false,
      error: 'Couldn’t check your existing homes. Try again.',
    })
  })

  it('refuses more rows than the cap before reading anything', async () => {
    const r = await previewRosterMatches({ homes: Array.from({ length: 5001 }, () => ({ address: 'x', unit: null })) })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/5,000 rows/) })
    expect(h.getClient).not.toHaveBeenCalled()
  })
})

describe('beginRosterImport (audit first)', () => {
  it('writes one audit row with counts and choices only, as the caller', async () => {
    const m = client()
    const r = await beginRosterImport({ associationId: null, mode: 'update', counts, fileType: 'xlsx', preset: 'cinc' })
    expect(r).toEqual({ ok: true, associationId: A1 })
    const [audit] = m.rows('audit_log')
    expect(audit).toMatchObject({
      action: 'properties_import',
      org_id: ORG,
      user_id: 'user-1',
      entity_type: 'org',
      entity_id: ORG,
      metadata: { source: 'board', association_id: A1, mode: 'update', file_type: 'xlsx', preset: 'cinc', rows: counts },
    })
    expect(m.rows('audit_log')).toHaveLength(1)
    // Logs: ids and counts only.
    expect(JSON.stringify(infos.mock.calls)).not.toMatch(/Test Way|@/)
  })

  it('a multi-community org must choose one; a community from elsewhere is refused', async () => {
    client({ associations: [{ id: A1, organization_id: ORG, name: 'A' }, { id: A2, organization_id: ORG, name: 'B' }] })
    expect(await beginRosterImport({ associationId: null, mode: 'skip', counts, fileType: 'csv', preset: 'generic' })).toEqual({
      ok: false,
      error: 'Choose which community this property belongs to.',
    })
    const other = '00000000-0000-4000-8000-000000000009'
    expect(await beginRosterImport({ associationId: other, mode: 'skip', counts, fileType: 'csv', preset: 'generic' })).toEqual({
      ok: false,
      error: 'Choose a community from the list.',
    })
  })

  it('a failed audit insert stops the import before any data', async () => {
    const m = memorySupabase({ associations: [{ id: A1, organization_id: ORG, name: 'A' }] }, { failOn: (c) => (c.table === 'audit_log' ? { code: '42501', message: 'rls' } : null) })
    ;(m.client as unknown as { auth: unknown }).auth = { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }
    h.getClient.mockResolvedValue(m.client)
    expect(await beginRosterImport({ associationId: null, mode: 'skip', counts, fileType: 'csv', preset: 'generic' })).toEqual({
      ok: false,
      error: 'Couldn’t start the import. Nothing was written. Try again.',
    })
    expect(JSON.stringify(errors.mock.calls)).not.toContain('rls')
  })
})

describe('commitRosterChunk', () => {
  it('writes the chunk to this org through the import engine', async () => {
    const m = client()
    const r = await commitRosterChunk({ associationId: A1, mode: 'skip', homes: [{ rows: [row(2, '1 Test Way', { ownerEmail: 'one@example.test' })] }] })
    expect(r).toMatchObject({ ok: true, results: [{ row: 2, status: 'new' }] })
    expect(m.rows('hoa_properties')[0]).toMatchObject({ org_id: ORG })
    expect(m.rows('units')[0]).toMatchObject({ organization_id: ORG, association_id: A1 })
  })

  it('refuses a malformed request with a plain message and writes nothing', async () => {
    const m = client()
    const r = await commitRosterChunk({ associationId: A1, mode: 'merge', homes: [{ rows: [{ row: 2, address: 1 }] }] })
    expect(r).toEqual({ ok: false, error: 'Some rows couldn’t be read. Check the file and try again.' })
    expect(m.calls.filter((c) => c.op !== 'select')).toEqual([])
  })

  it('refuses an oversized chunk', async () => {
    client()
    const homes = Array.from({ length: 3 }, (_, i) => ({ rows: Array.from({ length: 40 }, (_, j) => row(i * 100 + j + 2, `${i} Test Way`)) }))
    expect(await commitRosterChunk({ associationId: A1, mode: 'skip', homes })).toMatchObject({ ok: false })
  })

  it('an unexpected failure is a plain message and logs no row data', async () => {
    const m = client()
    ;(m.client as unknown as { from: unknown }).from = () => {
      throw Object.assign(new Error('boom at 1 Test Way'), { code: 'XX000' })
    }
    const r = await commitRosterChunk({ associationId: null, mode: 'skip', homes: [{ rows: [row(2, '1 Test Way')] }] })
    expect(r).toEqual({ ok: false, error: expect.any(String) })
    expect(JSON.stringify(r)).not.toContain('boom')
    expect(JSON.stringify(errors.mock.calls)).not.toContain('Test Way')
  })
})
