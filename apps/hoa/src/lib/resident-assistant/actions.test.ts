import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEC-003: the board's switch reads and writes the association it names,
// and only one of the current org's. A fake Supabase client models the
// org filter the way the real query applies it (.eq organization_id).

const ORG = 'org-1'
const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const FOREIGN = '33333333-3333-4333-8333-333333333333'

type Row = { id: string; name: string; organization_id: string; compliance_settings: Record<string, unknown> }

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  updates: [] as Array<{ id: string; value: Record<string, unknown> }>,
  gateOk: true,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => (h.gateOk ? { ok: true } : { ok: false, error: 'denied' })),
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: ORG })) }))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))
vi.mock('@/lib/load-or-fail', () => ({
  loadOrFail: async (_what: string, q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const r = await q
    return r.error ? { ok: false } : { ok: true, data: r.data }
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'board-1' } } }) },
    from: () => {
      const filters: Array<[string, unknown]> = []
      let update: Record<string, unknown> | null = null
      const match = () => h.rows.filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v))
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        update: (v: { compliance_settings: Record<string, unknown> }) => ((update = v.compliance_settings), q),
        then: (resolve: (v: unknown) => unknown) => {
          const hit = match()
          if (update) {
            for (const r of hit) {
              r.compliance_settings = update
              h.updates.push({ id: r.id, value: update })
            }
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(resolve)
          }
          return Promise.resolve({ data: hit.map(({ organization_id: _o, ...r }) => r), error: null }).then(resolve)
        },
      }
      return q
    },
  }),
}))

const { getBoardResidentAssistantSettings, saveResidentAssistantSettings } = await import('./actions')
const { residentAssistantOn } = await import('./settings')

beforeEach(() => {
  h.gateOk = true
  h.updates = []
  h.rows = [
    { id: A1, name: 'Alpha', organization_id: ORG, compliance_settings: { pay_by_zelle: { keep: 1 } } },
    { id: A2, name: 'Bravo', organization_id: ORG, compliance_settings: {} },
    { id: FOREIGN, name: 'Other org', organization_id: 'org-2', compliance_settings: {} },
  ]
})

describe('resident assistant board actions (SEC-002 / SEC-003)', () => {
  it('lists one switch per association in the org, never-saved ones OFF with the recommendation', async () => {
    const r = await getBoardResidentAssistantSettings()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.associations.map((a) => [a.association.id, a.on, a.recommendOn, a.state])).toEqual([
      [A1, false, true, 'not_configured'],
      [A2, false, true, 'not_configured'],
    ])
  })

  it('saves to the named association only, keeping its other keys', async () => {
    expect(await saveResidentAssistantSettings({ associationId: A2, on: true })).toEqual({ ok: true })
    expect(h.updates.map((u) => u.id)).toEqual([A2])
    const a2 = h.rows.find((r) => r.id === A2)!
    const a1 = h.rows.find((r) => r.id === A1)!
    expect(residentAssistantOn(A2, a2.compliance_settings, 'test-secret')).toBe(true)
    expect(residentAssistantOn(A1, a1.compliance_settings, 'test-secret')).toBe(false)

    await saveResidentAssistantSettings({ associationId: A1, on: true })
    expect(Object.keys(a1.compliance_settings).sort()).toEqual(['pay_by_zelle', 'resident_assistant'])

    const r = await getBoardResidentAssistantSettings()
    if (!r.ok) throw new Error('load failed')
    expect(r.data.associations.map((a) => [a.on, a.recommendOn])).toEqual([
      [true, false],
      [true, false],
    ])
  })

  it('refuses an association from another org, and writes nothing', async () => {
    const r = await saveResidentAssistantSettings({ associationId: FOREIGN, on: true })
    expect(r.ok).toBe(false)
    expect(h.updates).toEqual([])
  })

  it('refuses a missing or malformed association id', async () => {
    for (const input of [{ on: true }, { associationId: 'not-a-uuid', on: true }, { associationId: A1, on: 'yes' }]) {
      const r = await saveResidentAssistantSettings(input as never)
      expect(r).toEqual({ ok: false, error: 'Invalid input.' })
    }
    expect(h.updates).toEqual([])
  })

  it('is board/admin only', async () => {
    h.gateOk = false
    expect((await saveResidentAssistantSettings({ associationId: A1, on: true })).ok).toBe(false)
    expect(await getBoardResidentAssistantSettings()).toEqual({ ok: false, reason: 'forbidden' })
    expect(h.updates).toEqual([])
  })
})
