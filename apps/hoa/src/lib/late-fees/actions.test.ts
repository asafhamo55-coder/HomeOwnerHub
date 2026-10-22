import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-147 saveLateFeePolicy: board/admin only and refused before any client
// exists; the state cap is enforced at save; a save writes a SIGNED policy
// (the job trusts nothing else), keeps every other settings key, and writes
// one audit row with ids, enums and numbers only.

const ORG = 'org-1'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  state: 'GA' as string | null,
  governing: null as string | null,
  settings: {} as Record<string, unknown>,
  clients: 0,
  updates: [] as Array<Record<string, unknown>>,
  audit: [] as Array<Record<string, unknown>>,
  secret: 'test-secret' as string | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => h.secret }))

function fakeClient() {
  h.clients += 1
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let update: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filters[c] = v), q),
        order: () => q,
        limit: () => q,
        update: (v: Record<string, unknown>) => ((update = v), q),
        insert: (row: Record<string, unknown>) => {
          if (table === 'audit_log') h.audit.push(row)
          return Promise.resolve({ error: null })
        },
        then: (res: (v: unknown) => unknown) => {
          if (update) {
            h.updates.push(update)
            h.settings = update.compliance_settings as Record<string, unknown>
            return Promise.resolve({ data: [{ id: ASSOC }], error: null }).then(res)
          }
          const rows =
            table === 'associations' && filters.organization_id === ORG
              ? [{ id: ASSOC, name: 'Maple HOA', state: h.state, governing_law_state: h.governing, compliance_settings: h.settings }]
              : []
          return Promise.resolve({ data: rows, error: null }).then(res)
        },
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeClient()) }))

const { saveLateFeePolicy, getBoardLateFeePolicy } = await import('./actions')
const { readLateFeePolicy, LATE_FEE_POLICY_KEY } = await import('./store')

const input = (over: Partial<Parameters<typeof saveLateFeePolicy>[0]> = {}): Parameters<typeof saveLateFeePolicy>[0] => ({
  enabled: true,
  mode: 'percent',
  percent: '10',
  flat: '',
  graceDays: '15',
  excludeFines: true,
  declarationAttested: true,
  declarationRef: 'Declaration, Article VI, Section 3',
  ...over,
})

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.state = 'GA'
  h.governing = null
  h.settings = { pay_by_zelle: { kept: true } }
  h.clients = 0
  h.updates = []
  h.audit = []
  h.secret = 'test-secret'
})

describe('saveLateFeePolicy', () => {
  it('refuses a resident before any client is made', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect(await saveLateFeePolicy(input())).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(h.clients).toBe(0)
    expect(h.updates).toEqual([])
  })

  it('saves a signed policy the job can verify, keeping other settings keys', async () => {
    const r = await saveLateFeePolicy(input())
    expect(r.ok).toBe(true)
    expect(h.settings.pay_by_zelle).toEqual({ kept: true })
    const read = readLateFeePolicy(ASSOC, h.settings, 'test-secret')
    expect(read.state).toBe('saved')
    expect(read.policy).toMatchObject({ enabled: true, percentBps: 1000, graceDays: 15, excludeFines: true, declarationAttested: true })
  })

  it('Georgia: a policy above the cap cannot be saved, and nothing is written', async () => {
    const r = await saveLateFeePolicy(input({ percent: '11' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors?.percent).toMatch(/44-3-232\(b\)\(1\)/)
    expect(h.updates).toEqual([])
    expect(h.audit).toEqual([])
  })

  it('Georgia: cannot turn on without attesting the declaration provides for a late charge', async () => {
    const r = await saveLateFeePolicy(input({ declarationAttested: false }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors?.declarationAttested).toMatch(/Georgia allows a late charge only if your declaration provides/)
    expect(h.updates).toEqual([])
  })

  it('uses governing_law_state for the cap (FL: 5%)', async () => {
    h.governing = 'FL'
    const r = await saveLateFeePolicy(input({ percent: '10' }))
    expect(r.ok).toBe(false)
    expect((await saveLateFeePolicy(input({ percent: '5' }))).ok).toBe(true)
  })

  it('writes one audit row with ids, enums and numbers only — never the declaration text', async () => {
    await saveLateFeePolicy(input())
    expect(h.audit).toEqual([
      {
        org_id: ORG,
        user_id: 'user-1',
        action: 'late_fee_policy.saved',
        entity_type: 'association',
        entity_id: ASSOC,
        metadata: { enabled: true, mode: 'percent', percent_bps: 1000, flat_cents: null, grace_days: 15, exclude_fines: true, attested: true, state: 'GA' },
      },
    ])
    expect(JSON.stringify(h.audit)).not.toContain('Article')
  })

  it('fails closed with no signing secret', async () => {
    h.secret = null
    const r = await saveLateFeePolicy(input())
    expect(r.ok).toBe(false)
    expect(h.updates).toEqual([])
  })

  it('turning it off saves a policy that charges nothing', async () => {
    await saveLateFeePolicy(input({ enabled: false, declarationAttested: false, declarationRef: '' }))
    expect(readLateFeePolicy(ASSOC, h.settings, 'test-secret')).toMatchObject({ state: 'saved', policy: { enabled: false } })
  })
})

describe('getBoardLateFeePolicy', () => {
  it('nothing saved: the safe default, with the GA rule to show', async () => {
    const r = await getBoardLateFeePolicy()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.state).toBe('none')
      expect(r.data.policy.enabled).toBe(false)
      expect(r.data.law?.citation).toBe('O.C.G.A. § 44-3-232(b)(1)')
    }
  })

  it('a hand-edited policy reads as unverified (off)', async () => {
    await saveLateFeePolicy(input())
    ;(h.settings[LATE_FEE_POLICY_KEY] as { policy: { percentBps: number } }).policy.percentBps = 9000
    const r = await getBoardLateFeePolicy()
    expect(r.ok && r.data.state).toBe('unverified')
    expect(r.ok && r.data.policy.enabled).toBe(false)
  })

  it('Texas: no loaded rule', async () => {
    h.state = 'TX'
    const r = await getBoardLateFeePolicy()
    expect(r.ok && r.data.law).toBeNull()
  })
})
