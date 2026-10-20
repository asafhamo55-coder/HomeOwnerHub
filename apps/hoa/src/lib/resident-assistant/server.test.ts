import { beforeEach, describe, expect, it, vi } from 'vitest'

// The resident-side gate (SEC-002 / SEC-003): it reads the switch of the
// resident's OWN association(s), never the org's first, and fails closed.

vi.mock('server-only', () => ({}))

const SECRET = 'test-secret'
const ORG = 'org-1'

const h = vi.hoisted(() => ({
  units: [] as Array<{ unit_id: string; association_id: string | null }>,
  rows: [] as Array<{ id: string; organization_id: string; name: string; compliance_settings: unknown }>,
  queried: [] as string[][],
}))

vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: ORG }) }))
vi.mock('@/lib/role-override', () => ({ getEffectiveRoleInOrg: async () => 'resident' }))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => SECRET }))
vi.mock('@/lib/resident', () => ({
  getResidentUnits: async () =>
    h.units.map((u) => ({ ...u, unit_number: null, address: null, association_name: null, association_time_zone: null, charges_from: null })),
}))
vi.mock('@/lib/impersonation', () => ({
  getResidentActor: async () => ({
    impersonating: false,
    id: 'u1',
    email: null,
    client: {
      from: () => {
        let ids: string[] | null = null
        let org: unknown = null
        const q: Record<string, unknown> = {
          select: () => q,
          order: () => q,
          limit: () => q,
          eq: (k: string, v: unknown) => (k === 'organization_id' ? (org = v) : null, q),
          in: (_k: string, v: string[]) => ((ids = v), q),
          then: (resolve: (v: unknown) => unknown) => {
            h.queried.push(ids ?? ['<no id filter>'])
            const data = h.rows.filter((r) => r.organization_id === org && (ids === null || ids.includes(r.id)))
            return Promise.resolve({ data, error: null }).then(resolve)
          },
        }
        return q
      },
    },
  }),
}))

const { resolveResidentAssistant } = await import('./server')
const { signResidentAssistantSettings, withResidentAssistantSettings } = await import('./settings')

const stamp = { updatedAt: '2026-10-19T00:00:00.000Z', updatedBy: 'board-1' }
const switched = (id: string, on: boolean) => withResidentAssistantSettings({}, signResidentAssistantSettings(id, on, stamp, SECRET))

beforeEach(() => {
  process.env.AI_API_KEY = 'test-key'
  h.queried = []
  // "Alpha" sorts first in the org and is ON; the resident lives in "Bravo".
  h.rows = [
    { id: 'a-alpha', organization_id: ORG, name: 'Alpha', compliance_settings: switched('a-alpha', true) },
    { id: 'a-bravo', organization_id: ORG, name: 'Bravo', compliance_settings: {} },
  ]
})

describe('resolveResidentAssistant', () => {
  it('reads the resident’s own association, not the org’s first (SEC-003)', async () => {
    h.units = [{ unit_id: 'u-1', association_id: 'a-bravo' }]
    expect(await resolveResidentAssistant()).toEqual({ on: false, reason: 'switched_off' })
    expect(h.queried).toEqual([['a-bravo']])

    h.rows[1]!.compliance_settings = switched('a-bravo', true)
    const on = await resolveResidentAssistant()
    expect(on.on).toBe(true)
    if (on.on) expect(on.associationIds).toEqual(['a-bravo'])
  })

  it('no linked home → off, without falling back to any association', async () => {
    h.units = []
    expect(await resolveResidentAssistant()).toEqual({ on: false, reason: 'no_association' })
    h.units = [{ unit_id: 'u-1', association_id: null }]
    expect(await resolveResidentAssistant()).toEqual({ on: false, reason: 'no_association' })
    expect(h.queried).toEqual([])
  })

  it('a never-saved switch is off (SEC-002)', async () => {
    h.units = [{ unit_id: 'u-1', association_id: 'a-bravo' }]
    h.rows[1]!.compliance_settings = { resident_assistant: undefined }
    expect((await resolveResidentAssistant()).on).toBe(false)
  })

  it('every one of the resident’s associations must be on, and readable', async () => {
    h.units = [
      { unit_id: 'u-1', association_id: 'a-alpha' },
      { unit_id: 'u-2', association_id: 'a-bravo' },
    ]
    expect((await resolveResidentAssistant()).on).toBe(false)
    // A unit whose association row is not returned (RLS) is not ON.
    h.units = [
      { unit_id: 'u-1', association_id: 'a-alpha' },
      { unit_id: 'u-3', association_id: 'a-hidden' },
    ]
    expect((await resolveResidentAssistant()).on).toBe(false)
  })
})
