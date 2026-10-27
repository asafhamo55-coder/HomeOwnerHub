import { beforeEach, describe, expect, it, vi } from 'vitest'

// Board and emergency contacts: the save action. A server action is a public
// endpoint, so a non-board caller must be refused before anything is read.

const ORG = 'org-1'
const A1 = '11111111-1111-4111-8111-111111111111'
const contact = { label: 'President', name: 'Pat Example', phone: '', email: 'pat@example.org', emergencyLine: '' }

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as Record<string, unknown>,
  stored: { pay_by_zelle: { keep: 1 } } as Record<string, unknown>,
  found: true,
  updates: [] as Array<Record<string, unknown>>,
  clientCalls: 0,
  orgFilters: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => {
    h.clientCalls += 1
    return {
      from: () => {
        let update: Record<string, unknown> | null = null
        const q: Record<string, unknown> = {
          select: () => q,
          eq: (k: string, v: unknown) => (k === 'organization_id' && h.orgFilters.push(v), q),
          update: (v: { compliance_settings: Record<string, unknown> }) => ((update = v.compliance_settings), q),
          maybeSingle: async () => ({ data: h.found ? { id: A1, compliance_settings: h.stored } : null, error: null }),
          then: (resolve: (v: unknown) => unknown) => {
            if (update) h.updates.push(update)
            return Promise.resolve({ data: update ? [{ id: A1 }] : [], error: null }).then(resolve)
          },
        }
        return q
      },
    }
  },
}))

const { saveBoardContacts } = await import('./association-contacts-actions')

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.stored = { pay_by_zelle: { keep: 1 } }
  h.found = true
  h.updates = []
  h.clientCalls = 0
  h.orgFilters = []
})

describe('saveBoardContacts', () => {
  it('refuses a non-board caller before touching the database', async () => {
    h.gate = { ok: false, error: 'denied' }
    const r = await saveBoardContacts({ associationId: A1, contacts: [contact] })
    expect(r).toEqual({ ok: false, error: 'denied' })
    expect(h.clientCalls).toBe(0)
    expect(h.updates).toHaveLength(0)
  })

  it('lets a board member and an admin save, keeping other keys and scoping to the org', async () => {
    for (const role of ['board', 'admin']) {
      h.gate = { ok: true, role, orgId: ORG }
      h.updates = []
      const r = await saveBoardContacts({ associationId: A1, contacts: [contact] })
      expect(r).toEqual({ ok: true })
      expect(h.updates[0]).toMatchObject({ pay_by_zelle: { keep: 1 }, board_contacts: [contact] })
    }
    expect(h.orgFilters.every((o) => o === ORG)).toBe(true)
  })

  it('rejects invalid input with field errors and writes nothing', async () => {
    const r = await saveBoardContacts({ associationId: A1, contacts: [{ label: '', email: 'bad' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors?.['contacts.0.label']).toBeTruthy()
    expect(h.updates).toHaveLength(0)
  })

  it('rejects more than the cap', async () => {
    const r = await saveBoardContacts({ associationId: A1, contacts: Array.from({ length: 9 }, () => contact) })
    expect(r.ok).toBe(false)
    expect(h.updates).toHaveLength(0)
  })

  it('does not write when the association is not in the caller’s org', async () => {
    h.found = false
    const r = await saveBoardContacts({ associationId: A1, contacts: [contact] })
    expect(r.ok).toBe(false)
    expect(h.updates).toHaveLength(0)
  })
})
