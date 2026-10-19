import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-052: setDocumentVisibleToOwners is inert until M1_APPLIED; with it on
// it is board-only, org-scoped, and refuses the always-visible types.

const m1 = vi.hoisted(() => ({ value: false }))
vi.mock('@homeowner-portal/db/m1', () => ({
  get M1_APPLIED() {
    return m1.value
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const gate = vi.hoisted(() => ({ value: { ok: true, role: 'board', orgId: 'org-1' } as { ok: boolean; error?: string; orgId?: string } }))
vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'denied', requireBoardOrAdminForAction: async () => gate.value }))

const DOC = '0b6f4a7e-6a43-4c1e-9f55-1d1e3c1c0a01'
const calls: Array<[string, ...unknown[]]> = []
const doc = vi.hoisted(() => ({ value: { id: 'x', type: 'other' } as { id: string; type: string } | null }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => {
    const b: Record<string, unknown> = {}
    for (const op of ['from', 'update', 'eq']) {
      b[op] = (...args: unknown[]) => {
        calls.push([op, ...args])
        return b
      }
    }
    // read: .select('id, type')...maybeSingle(); write: .update().eq().eq().select('id')
    b.select = (...args: unknown[]) => {
      calls.push(['select', ...args])
      if (args[0] === 'id') return Promise.resolve({ data: [{ id: DOC }], error: null })
      return b
    }
    b.maybeSingle = async () => ({ data: doc.value, error: null })
    return b
  },
}))

const { setDocumentVisibleToOwners } = await import('./document-owner-visibility')

beforeEach(() => {
  calls.length = 0
  m1.value = false
  gate.value = { ok: true, orgId: 'org-1' }
  doc.value = { id: DOC, type: 'other' }
})

describe('setDocumentVisibleToOwners', () => {
  it('flag off: refuses and touches nothing', async () => {
    expect((await setDocumentVisibleToOwners(DOC, true)).ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('board only', async () => {
    m1.value = true
    gate.value = { ok: false, error: 'denied' }
    expect(await setDocumentVisibleToOwners(DOC, true)).toEqual({ ok: false, error: 'denied' })
    expect(calls).toEqual([])
  })

  it('writes visible_to_owners scoped to the org', async () => {
    m1.value = true
    expect(await setDocumentVisibleToOwners(DOC, true)).toEqual({ ok: true })
    expect(calls).toContainEqual(['update', { visible_to_owners: true }])
    expect(calls.filter((c) => c[0] === 'eq' && c[1] === 'org_id')).toHaveLength(2)
  })

  it('governing documents and rules are always visible — no switch', async () => {
    m1.value = true
    doc.value = { id: DOC, type: 'rules' }
    expect(await setDocumentVisibleToOwners(DOC, false)).toEqual({
      ok: false,
      error: 'Governing documents and rules are always visible to owners.',
    })
    expect(calls.some((c) => c[0] === 'update')).toBe(false)
  })

  it('another org’s document reads as not found', async () => {
    m1.value = true
    doc.value = null
    expect(await setDocumentVisibleToOwners(DOC, true)).toEqual({ ok: false, error: 'Document not found.' })
  })

  it('governing documents: writes governing_documents scoped by organization_id', async () => {
    m1.value = true
    doc.value = { id: DOC, type: 'minutes' }
    expect(await setDocumentVisibleToOwners(DOC, true, 'governing')).toEqual({ ok: true })
    expect(calls).toContainEqual(['from', 'governing_documents'])
    expect(calls).toContainEqual(['update', { visible_to_owners: true }])
    expect(calls.filter((c) => c[0] === 'eq' && c[1] === 'organization_id')).toHaveLength(2)
    expect(calls.some((c) => c[0] === 'from' && c[1] === 'hoa_documents')).toBe(false)
  })

  it('governing allowlisted types (declaration, policy…) are not switchable', async () => {
    m1.value = true
    doc.value = { id: DOC, type: 'policy' }
    expect((await setDocumentVisibleToOwners(DOC, false, 'governing')).ok).toBe(false)
    expect(calls.some((c) => c[0] === 'update')).toBe(false)
  })

  it('refuses an unknown source', async () => {
    m1.value = true
    expect((await setDocumentVisibleToOwners(DOC, true, 'other' as never)).ok).toBe(false)
    expect(calls).toEqual([])
  })
})
