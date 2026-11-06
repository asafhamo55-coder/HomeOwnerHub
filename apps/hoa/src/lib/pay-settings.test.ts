import { beforeEach, describe, expect, it, vi } from 'vitest'

// getResidentZelleSettings: contacts and pay details come only from the
// associations the resident belongs to, even if the database returns more.

const M = vi.hoisted(() => ({ rows: [] as unknown[] }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/workflows', () => ({ memoCodeFor: () => 'X' }))
vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn() }))
vi.mock('@/lib/impersonation', () => ({
  getResidentActor: async () => ({
    id: 'u1',
    orgId: 'org-1',
    client: {
      from: () => {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'in', 'eq']) q[m] = () => q
        q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: M.rows, error: null }).then(resolve)
        return q
      },
    },
  }),
}))

const { getResidentZelleSettings } = await import('./pay-settings')

const MINE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const contact = (label: string) => ({ label, name: 'N', phone: '(555) 010-0100', email: '', emergencyLine: '' })

beforeEach(() => {
  M.rows = [
    { id: MINE, compliance_settings: { board_contacts: [contact('Mine')] } },
    { id: OTHER, compliance_settings: { board_contacts: [contact('Theirs')] } },
  ]
})

describe('getResidentZelleSettings', () => {
  it('returns contacts and pay state only for the resident’s own association', async () => {
    const r = await getResidentZelleSettings([MINE])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.byAssociation)).toEqual([MINE])
    expect(Object.keys(r.contactsByAssociation)).toEqual([MINE])
    expect(JSON.stringify(r.contactsByAssociation)).toContain('Mine')
    expect(JSON.stringify(r.contactsByAssociation)).not.toContain('Theirs')
  })
})
