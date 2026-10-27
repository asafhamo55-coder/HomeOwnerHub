import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-176 updateAssociationSettings: admin only (board is refused although
// RLS would allow a board update), refused before any client exists; the row
// is org-scoped (a foreign association id changes nothing); input is
// validated; the audit row holds ids and state/type codes only.

const ORG = 'org-1'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const OTHER_ASSOC = 'a0000000-0000-4000-8000-000000000002'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'admin', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  clients: 0,
  updates: [] as Array<{ values: Record<string, unknown>; filters: Record<string, unknown> }>,
  audit: [] as Array<Record<string, unknown>>,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))

// Rows that exist: ASSOC belongs to org-1; OTHER_ASSOC to another org.
const ROWS: Record<string, { organization_id: string; state: string; governing_law_state: string; type: string }> = {
  [ASSOC]: { organization_id: ORG, state: 'GA', governing_law_state: 'GA', type: 'hoa' },
  [OTHER_ASSOC]: { organization_id: 'org-2', state: 'TX', governing_law_state: 'TX', type: 'hoa' },
}

function fakeClient() {
  h.clients += 1
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let update: Record<string, unknown> | null = null
      const matched = () => {
        const row = ROWS[String(filters.id)]
        return row && row.organization_id === filters.organization_id ? row : null
      }
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filters[c] = v), q),
        update: (v: Record<string, unknown>) => ((update = v), q),
        insert: (row: Record<string, unknown>) => {
          if (table === 'audit_log') h.audit.push(row)
          return Promise.resolve({ error: null })
        },
        maybeSingle: () => Promise.resolve({ data: matched() ? { id: filters.id, ...matched() } : null, error: null }),
        then: (res: (v: unknown) => unknown) => {
          if (update) {
            const hit = matched()
            if (hit) h.updates.push({ values: update, filters: { ...filters } })
            return Promise.resolve({ data: hit ? [{ id: filters.id }] : [], error: null }).then(res)
          }
          return Promise.resolve({ data: [], error: null }).then(res)
        },
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeClient()) }))

const { updateAssociationSettings } = await import('./association-settings-actions')
const { ADMIN_ONLY_DENIED } = await import('./association-settings')

const input = (over: Record<string, unknown> = {}) => ({
  associationId: ASSOC,
  name: 'Maple Grove HOA',
  state: 'FL',
  type: 'condo',
  governingLawState: '',
  ...over,
})

beforeEach(() => {
  h.gate = { ok: true, role: 'admin', orgId: ORG }
  h.clients = 0
  h.updates = []
  h.audit = []
})

describe('updateAssociationSettings', () => {
  it('an admin changes state and type; the row is org-scoped and governing law follows the state', async () => {
    expect(await updateAssociationSettings(input())).toEqual({ ok: true })
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]!.values).toEqual({ name: 'Maple Grove HOA', state: 'FL', governing_law_state: 'FL', type: 'condo' })
    expect(h.updates[0]!.filters).toEqual({ id: ASSOC, organization_id: ORG })
  })

  it('keeps a different governing-law state when the admin sets one', async () => {
    await updateAssociationSettings(input({ governingLawState: 'ga' }))
    expect(h.updates[0]!.values).toMatchObject({ state: 'FL', governing_law_state: 'GA' })
  })

  it('refuses a board member before any client exists', async () => {
    h.gate = { ok: true, role: 'board', orgId: ORG }
    expect(await updateAssociationSettings(input())).toEqual({ ok: false, error: ADMIN_ONLY_DENIED })
    expect(h.clients).toBe(0)
    expect(h.updates).toEqual([])
  })

  it('refuses a resident (the board gate) before any client exists', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect(await updateAssociationSettings(input())).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(h.clients).toBe(0)
  })

  it('refuses an association of another organization: nothing is written', async () => {
    const r = await updateAssociationSettings(input({ associationId: OTHER_ASSOC }))
    expect(r.ok).toBe(false)
    expect(h.updates).toEqual([])
    expect(h.audit).toEqual([])
  })

  it.each([
    ['not a state', { state: 'ZZ' }],
    ['lower-case junk', { state: 'Georgia' }],
    ['unknown type', { type: 'timeshare' }],
    ['bad governing-law state', { governingLawState: 'XX' }],
    ['short name', { name: 'A' }],
    ['not a uuid', { associationId: 'nope' }],
  ])('refuses invalid input (%s) before any client exists', async (_n, over) => {
    const r = await updateAssociationSettings(input(over))
    expect(r.ok).toBe(false)
    expect(h.clients).toBe(0)
    expect(h.updates).toEqual([])
  })

  it('reports which field was wrong', async () => {
    const r = await updateAssociationSettings(input({ state: 'ZZ' }))
    expect(r).toMatchObject({ ok: false, fieldErrors: { state: expect.any(String) } })
  })

  it('writes one audit row with ids and codes only: no name, no PII', async () => {
    await updateAssociationSettings(input({ name: 'Maple Grove HOA, 12 Oak Lane' }))
    expect(h.audit).toHaveLength(1)
    const row = h.audit[0]!
    expect(row).toMatchObject({
      org_id: ORG,
      user_id: 'user-1',
      action: 'association.settings_updated',
      entity_type: 'association',
      entity_id: ASSOC,
      metadata: {
        old_state: 'GA',
        new_state: 'FL',
        old_governing_law_state: 'GA',
        new_governing_law_state: 'FL',
        old_type: 'hoa',
        new_type: 'condo',
      },
    })
    const json = JSON.stringify(row)
    expect(json).not.toContain('Maple')
    expect(json).not.toContain('Oak Lane')
    expect(Object.keys((row as { metadata: object }).metadata).sort()).toEqual([
      'new_governing_law_state',
      'new_state',
      'new_type',
      'old_governing_law_state',
      'old_state',
      'old_type',
    ])
  })
})
