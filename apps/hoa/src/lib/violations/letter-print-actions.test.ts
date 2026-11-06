import { describe, expect, it, vi } from 'vitest'

const ID = '11111111-2222-4333-8444-555555555555'

const h = vi.hoisted(() => ({
  role: 'board' as string | null,
  row: null as { id: string; property_id: string | null; approved_letter: string | null } | null,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  auditError: null as { code: string } | null,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: { id: 'org-1' } })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => ({ data: h.row, error: null }),
        insert: async (row: Record<string, unknown>) => {
          h.inserts.push({ table, row })
          return { error: h.auditError }
        },
      }
      return chain
    },
  })),
}))

import { recordViolationLetterPrinted } from './letter-print-actions'

const input = { violationId: ID, letterDate: '2026-11-02' }

describe('recordViolationLetterPrinted', () => {
  it('writes one audit row with ids and a day only', async () => {
    h.role = 'board'
    h.row = { id: ID, property_id: 'p-1', approved_letter: 'Dear owner, secret text' }
    h.inserts = []
    h.auditError = null
    expect(await recordViolationLetterPrinted(input)).toEqual({ ok: true })
    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0]!.table).toBe('audit_log')
    expect(h.inserts[0]!.row).toMatchObject({ action: 'violation_letter_printed', org_id: 'org-1', user_id: 'user-1', entity_type: 'violation_letter', entity_id: ID })
    expect(JSON.stringify(h.inserts[0]!.row)).not.toContain('secret text')
  })

  it.each(['resident', 'vendor', null])('refuses %s and writes nothing', async (role) => {
    h.role = role
    h.row = { id: ID, property_id: null, approved_letter: 'x' }
    h.inserts = []
    expect((await recordViolationLetterPrinted(input)).ok).toBe(false)
    expect(h.inserts).toHaveLength(0)
  })

  it('refuses when there is no approved letter', async () => {
    h.role = 'admin'
    h.row = { id: ID, property_id: null, approved_letter: null }
    h.inserts = []
    expect((await recordViolationLetterPrinted(input)).ok).toBe(false)
    expect(h.inserts).toHaveLength(0)
  })

  it('refuses when the record cannot be written, so nothing prints', async () => {
    h.role = 'board'
    h.row = { id: ID, property_id: null, approved_letter: 'x' }
    h.auditError = { code: '42501' }
    expect(await recordViolationLetterPrinted(input)).toMatchObject({ ok: false })
    h.auditError = null
  })
})
