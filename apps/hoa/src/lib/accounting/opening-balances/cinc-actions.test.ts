import { beforeEach, describe, expect, it, vi } from 'vitest'

// previewCincAging is a public POST endpoint. The role gate runs before the
// file is read or any client exists; a board member gets a dry run whose
// audit row carries ids and counts only. Fabricated data only.

const ORG = 'org-1'
const ASSOC = '10000000-0000-4000-8000-000000000001'
const UNIT = '20000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  client: vi.fn(),
  inserts: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: ORG, name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: h.client }))
vi.mock('@/lib/association-setup', () => ({
  readPrimaryAssociation: vi.fn(async () => ({ ok: true, data: { id: ASSOC, name: 'Test', timeZone: 'America/New_York' } })),
}))

import { previewCincAging } from './cinc-actions'
import { ACCOUNTING_DENIED } from '../guard'

function fakeDb() {
  const units = [{ id: UNIT, address_line1: '12 Test Lane', unit_number: null, lot_number: null }]
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    range: async (from: number) => ({ data: from === 0 ? units : [], error: null }),
  }
  return {
    from: (table: string) =>
      table === 'audit_log'
        ? {
            insert: async (row: Record<string, unknown>) => {
              h.inserts.push(row)
              return { error: null }
            },
          }
        : q,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }
}

function upload(text: string, extra: Record<string, string> = {}): FormData {
  const f = new FormData()
  f.append('file', new Blob([text], { type: 'text/csv' }))
  for (const [k, v] of Object.entries(extra)) f.append(k, v)
  return f
}

beforeEach(() => {
  h.role = 'board'
  h.inserts = []
  h.client.mockReset()
  h.client.mockImplementation(async () => fakeDb())
})

describe('previewCincAging', () => {
  it('refuses a resident before reading the file or creating a client', async () => {
    h.role = 'resident'
    expect(await previewCincAging(upload('Account,Balance\n'))).toEqual({ ok: false, error: ACCOUNTING_DENIED })
    expect(h.client).not.toHaveBeenCalled()
  })

  it('refuses a missing file and a bad column choice before the database', async () => {
    expect(await previewCincAging(new FormData())).toMatchObject({ ok: false })
    expect(await previewCincAging(upload('x', { mapping: '{nope' }))).toMatchObject({ ok: false })
    expect(h.client).not.toHaveBeenCalled()
  })

  it('previews a board member’s report and audits counts only', async () => {
    const r = await previewCincAging(upload('Account #,Homeowner Name,Property Address,Balance\n1001,Fake Owner,12 Test Lane,"1,000.01"\n'))
    if (!r.ok) throw new Error(r.error)
    expect(r.ok && r.matched).toEqual([{ line: 2, unitId: UNIT, label: '12 Test Lane', cents: 100001, via: 'address' }])
    expect(h.inserts).toHaveLength(1)
    const row = h.inserts[0]!
    expect(row).toMatchObject({ action: 'opening_balances.cinc_previewed', org_id: ORG, entity_id: ASSOC })
    expect(row.metadata).toEqual({ ok: true, rows: 1, matched: 1, unmatched: 0, credits: 0, zero: 0, reconciles: null })
    const text = JSON.stringify(row)
    expect(text).not.toMatch(/Test Lane|Fake Owner|1001|1,000/)
  })
})
