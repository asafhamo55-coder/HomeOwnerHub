import { beforeEach, describe, expect, it, vi } from 'vitest'

// Board side of the public page: which documents may be put on it.

type Result = { data: unknown; error: { code?: string } | null }
const results = new Map<string, Result>()
const inserts: { table: string; row: unknown }[] = []
const queries: { table: string; ors: string[]; eqs: [string, unknown][] }[] = []

function fake() {
  return {
    from(table: string) {
      const rec = { table, ors: [] as string[], eqs: [] as [string, unknown][] }
      queries.push(rec)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'limit', 'is', 'gte', 'in']) q[m] = () => q
      q.eq = (c: string, v: unknown) => (rec.eqs.push([c, v]), q)
      q.or = (f: string) => (rec.ors.push(f), q)
      q.insert = (row: unknown) => (inserts.push({ table, row }), Promise.resolve({ error: null }))
      q.maybeSingle = () => Promise.resolve(results.get(table) ?? { data: null, error: null })
      q.then = (res: (v: unknown) => void) => res(results.get(table) ?? { data: [], error: null })
      return q
    },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'no',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, orgId: 'org1' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ ...fake(), auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } })),
}))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => fake() }))

import { addDocumentToSite, getBoardPublicSite } from './actions'

const DOC = '22222222-2222-4222-8222-222222222222'
const GOV = { storage_path: 'o/f.pdf', type: 'bylaws', ai_generated: false, superseded_at: null, visible_to_owners: false, association_id: null }

beforeEach(() => {
  results.clear()
  inserts.length = 0
  queries.length = 0
  results.set('associations', { data: [{ id: 'assoc1', name: 'Oak Hollow' }], error: null })
  results.set('public_sites', { data: { id: 's1', slug: 'oak-hollow', association_id: 'assoc1' }, error: null })
})

describe('addDocumentToSite', () => {
  it('adds a current bylaws document that belongs to the page association', async () => {
    results.set('governing_documents', { data: { ...GOV, association_id: 'assoc1' }, error: null })
    expect((await addDocumentToSite({ source: 'governing', id: DOC, title: 'Bylaws' })).ok).toBe(true)
    expect(inserts).toHaveLength(1)
  })

  it('refuses a document of another association in the same organization', async () => {
    results.set('governing_documents', { data: { ...GOV, association_id: 'assoc2' }, error: null })
    expect((await addDocumentToSite({ source: 'governing', id: DOC, title: 'Bylaws' })).ok).toBe(false)
    expect(inserts).toHaveLength(0)
  })

  it('refuses a document type residents cannot see', async () => {
    results.set('hoa_documents', { data: { storage_path: 'o/h.pdf', type: 'other', visible_to_owners: false }, error: null })
    expect((await addDocumentToSite({ source: 'hoa', id: DOC, title: 'Letter' })).ok).toBe(false)
    expect(inserts).toHaveLength(0)
  })
})

describe('the document picker', () => {
  it('asks only for resident-visible documents of this association, and lists only those', async () => {
    results.set('hoa_documents', {
      data: [
        { id: 'h1', name: 'CC&Rs', type: 'ccr', storage_path: 'a', visible_to_owners: false },
        { id: 'h2', name: 'Collection letter', type: 'other', storage_path: 'b', visible_to_owners: false },
      ],
      error: null,
    })
    results.set('governing_documents', {
      data: [
        { id: 'g1', title: 'Bylaws', ...GOV },
        { id: 'g2', title: 'Other community bylaws', ...GOV, association_id: 'assoc2' },
      ],
      error: null,
    })
    const r = await getBoardPublicSite()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.documents.map((d) => d.id)).toEqual(['h1', 'g1'])
    const gov = queries.find((q) => q.table === 'governing_documents')!
    expect(gov.ors.join(' ')).toContain('assoc1')
    expect(gov.ors.join(' ')).toContain('visible_to_owners')
  })
})
